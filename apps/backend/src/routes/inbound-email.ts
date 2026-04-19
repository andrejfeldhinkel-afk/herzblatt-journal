/**
 * POST /inbound-email
 *
 * SendGrid Inbound-Parse-Webhook. Empfängt alle E-Mails die an
 * support@herzblatt-journal.de kommen.
 *
 * Setup in SendGrid (einmalig):
 *   1. Settings → Inbound Parse → Add Host & URL
 *      Host: herzblatt-journal.de
 *      URL: https://backend-production-c327.up.railway.app/inbound-email
 *      POST the raw, full MIME message: YES
 *   2. United-Domains: MX-Record für herzblatt-journal.de
 *      (oder subdomain 'mail.herzblatt-journal.de') → mx.sendgrid.net
 *
 * SendGrid sendet multipart/form-data mit Feldern:
 *   from, to, subject, text, html, headers, envelope, charsets, sender_ip, SPF, dkim, spam_score, email (raw)
 *
 * Wir parsen die wichtigsten Felder + speichern in inbound_emails-Tabelle.
 */
import { Hono } from 'hono';
import { db, schema } from '../db/index.js';
import { getClientIp, hashIp } from '../lib/crypto.js';
import { allowRequest } from '../lib/rate-limit.js';

const app = new Hono();

// 60 Inbound-Emails pro Minute pro IP — realer SendGrid-Traffic liegt
// deutlich darunter, aber wir wollen DB-Row-Flood auf unsigniertem Endpoint
// begrenzen. Siehe Phase-6 D) CRITICAL: SendGrid Inbound Parse liefert keine
// Signatur von Haus aus, darum ist Rate-Limit die erste Schutzschicht.
function allowInboundEmail(ipHash: string): boolean {
  return allowRequest('inb:' + ipHash, 60, 60_000);
}

function extractEmail(str: string): { email: string; name?: string } {
  // Parst "Name <email@domain>" oder nur "email@domain"
  const m = str.match(/^\s*(?:"?([^"<]+)"?\s*)?<?([^\s<>]+@[^\s<>]+)>?\s*$/);
  if (m) {
    return { email: m[2].toLowerCase().trim(), name: m[1]?.trim() || undefined };
  }
  return { email: str.toLowerCase().trim() };
}

function extractHeader(headersStr: string, name: string): string | null {
  if (!headersStr) return null;
  const lower = name.toLowerCase();
  const lines = headersStr.split(/\r?\n/);
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim().toLowerCase();
    if (key === lower) return line.slice(colonIdx + 1).trim();
  }
  return null;
}

function deriveThreadId(messageId: string | null, inReplyTo: string | null, subject: string | null, fromEmail: string): string {
  // Priorität: In-Reply-To (gleicher Thread), dann Message-ID (neuer Thread), dann Subject+From-Fallback
  if (inReplyTo) return inReplyTo.replace(/[<>]/g, '').trim();
  if (messageId) return messageId.replace(/[<>]/g, '').trim();
  const normSubj = (subject || '').replace(/^(re|aw|fwd?):\s*/i, '').trim().toLowerCase().slice(0, 80);
  return `thread-${fromEmail}-${normSubj}`.replace(/[^a-z0-9-]/g, '-').slice(0, 200);
}

app.post('/', async (c) => {
  // Rate-Limit: 60/min pro IP (SendGrid liefert weit weniger, Flood-Schutz)
  const ip = getClientIp(c.req.raw, c.req.raw.headers);
  if (!allowInboundEmail(hashIp(ip))) {
    console.warn('[inbound-email] rate-limit hit');
    return c.text('rate-limit', 429, { 'Retry-After': '60' });
  }

  try {
    const ct = c.req.header('content-type') || '';

    let from = '';
    let to = '';
    let subject = '';
    let text = '';
    let html = '';
    let headersRaw = '';
    let rawBody = '';

    if (ct.includes('multipart/form-data') || ct.includes('application/x-www-form-urlencoded')) {
      const fd = await c.req.parseBody();
      from = String(fd.from || '');
      to = String(fd.to || '');
      subject = String(fd.subject || '');
      text = String(fd.text || '');
      html = String(fd.html || '');
      headersRaw = String(fd.headers || '');
      rawBody = String(fd.email || '').slice(0, 50_000); // cap
    } else if (ct.includes('application/json')) {
      const body = (await c.req.json()) as any;
      from = body.from || '';
      to = body.to || '';
      subject = body.subject || '';
      text = body.text || '';
      html = body.html || '';
      headersRaw = body.headers || '';
      rawBody = (body.email || '').slice(0, 50_000);
    } else {
      // Fallback: raw text
      const t = await c.req.text();
      rawBody = t.slice(0, 50_000);
      from = 'unknown@unknown';
      to = 'support@herzblatt-journal.de';
      subject = '(konnte parsen)';
      text = t.slice(0, 5000);
    }

    const fromParsed = extractEmail(from);
    const toParsed = extractEmail(to);

    const messageId = extractHeader(headersRaw, 'message-id');
    const inReplyTo = extractHeader(headersRaw, 'in-reply-to');
    const threadId = deriveThreadId(messageId, inReplyTo, subject, fromParsed.email);

    // Auto-reject wenn from-Adresse unsere eigene ist (Loop-Schutz)
    if (fromParsed.email.endsWith('@herzblatt-journal.de')) {
      console.log('[inbound-email] ignoring own-domain email:', fromParsed.email);
      return c.text('OK', 200);
    }

    // Simple Spam-Filter: extrem kurze oder extrem lange Mails
    const bodyLen = (text || html).length;
    const isLikelySpam = bodyLen < 5 || bodyLen > 500_000;

    // onConflictDoNothing auf (partial) UNIQUE(message_id):
    // SendGrid retried bei Non-200 bis 24h. Ohne Unique + Conflict-Handling
    // führten Retries zu Duplikat-Inbox-Entries. Partial-Unique ignoriert
    // NULL-message_id-Rows (kein Conflict → Insert läuft durch).
    await db
      .insert(schema.inboundEmails)
      .values({
        direction: 'in',
        fromEmail: fromParsed.email.slice(0, 254),
        fromName: fromParsed.name?.slice(0, 200) || null,
        toEmail: toParsed.email.slice(0, 254),
        subject: subject.slice(0, 500),
        bodyText: text.slice(0, 100_000),
        bodyHtml: html.slice(0, 500_000),
        messageId: messageId?.slice(0, 500) || null,
        inReplyTo: inReplyTo?.slice(0, 500) || null,
        threadId: threadId.slice(0, 500),
        status: isLikelySpam ? 'spam' : 'unread',
        rawPayload: rawBody,
      })
      .onConflictDoNothing({ target: schema.inboundEmails.messageId });

    console.log(`[inbound-email] received from ${fromParsed.email}: "${subject.slice(0, 60)}"`);
    return c.text('OK', 200);
  } catch (err) {
    console.error('[inbound-email] error:', err);
    // Trotzdem 200 damit SendGrid nicht retries einleitet (sonst kriegen wir duplikate)
    return c.text('OK (logged error)', 200);
  }
});

export default app;
