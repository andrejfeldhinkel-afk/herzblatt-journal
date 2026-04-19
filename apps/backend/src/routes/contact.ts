/**
 * POST /contact
 *
 * Öffentliches Kontaktformular. Speichert jede Nachricht in der
 * `inbound_emails`-Tabelle (direction='in'), damit sie im Admin-Inbox
 * (`/herzraum/inbox`) genauso sichtbar ist wie eine per SendGrid
 * eingelieferte Support-E-Mail.
 *
 * Schutz:
 *  - Rate-Limit: max 3 Nachrichten pro 10 min pro IP-Hash
 *  - Schema-Validation mit zod (name, email, message)
 *  - Min-Length-Check (Spam-Schutz: 20 Zeichen)
 *  - URL/Link-Heuristik -> als 'spam' markieren (nicht blockieren)
 *  - Test-Domains werden akzeptiert aber nicht gespeichert (Smoke-Tests grün)
 *
 * Response:
 *  - 200 { success: true } wenn gespeichert
 *  - 400 { success: false, message } bei Validation-Error
 *  - 429 { success: false, message } bei Rate-Limit
 *  - 500 { success: false, message } bei DB-Fehler
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { db, schema } from '../db/index.js';
import { getClientIp, hashIp } from '../lib/crypto.js';
import { allowRequest } from '../lib/rate-limit.js';

const app = new Hono();

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

// URL-Heuristik: mehr als 1 Link im Body → wahrscheinlich Spam
const URL_REGEX = /(https?:\/\/|www\.)[^\s]+/gi;

// Max 3 Nachrichten pro 10 min pro IP
function allowContact(ipHash: string): boolean {
  return allowRequest('contact:' + ipHash, 3, 10 * 60_000);
}

const bodySchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().min(1).max(254),
  message: z.string().min(1).max(10_000),
});

app.post('/', async (c) => {
  const ip = getClientIp(c.req.raw, c.req.raw.headers);
  const ipHashVal = hashIp(ip);

  if (!allowContact(ipHashVal)) {
    return c.json(
      {
        success: false,
        message: 'Zu viele Nachrichten in kurzer Zeit. Bitte versuch es in ein paar Minuten erneut.',
      },
      429,
    );
  }

  const ct = c.req.header('content-type') || '';
  if (!ct.includes('application/json')) {
    return c.json({ success: false, message: 'Invalid content type.' }, 400);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, message: 'Ungültige Daten.' }, 400);
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { success: false, message: 'Bitte fülle alle Felder korrekt aus.' },
      400,
    );
  }

  const name = parsed.data.name.trim();
  const email = parsed.data.email.trim().toLowerCase();
  const message = parsed.data.message.trim();

  // Email-Format
  if (!EMAIL_REGEX.test(email)) {
    return c.json(
      { success: false, message: 'Bitte gib eine gültige E-Mail-Adresse ein.' },
      400,
    );
  }

  // Min-Length Message (20 Zeichen) — Spam-Schutz gegen leere/triviale Submissions
  if (message.length < 20) {
    return c.json(
      {
        success: false,
        message: 'Deine Nachricht ist zu kurz. Bitte beschreibe dein Anliegen in mindestens 20 Zeichen.',
      },
      400,
    );
  }

  // Name-Plausibilität (min 2 Zeichen nach Trim)
  if (name.length < 2) {
    return c.json(
      { success: false, message: 'Bitte gib deinen Namen ein.' },
      400,
    );
  }

  // Test-Email-Filter: wie bei Newsletter — return success, aber nicht speichern.
  const TEST_DOMAINS = ['@test.com', '@example.com', '@example.org', '@example.net', '@localhost', '@mailinator.com', '@yopmail.com'];
  const TEST_PREFIXES = ['smoke-', 'debug-', 'debug-fe-', 'test-e2e-', 'final-', 'claude-', 'live-smoke-'];
  const isTestEmail =
    TEST_DOMAINS.some((d) => email.endsWith(d)) ||
    TEST_PREFIXES.some((p) => email.startsWith(p));
  if (isTestEmail) {
    console.log(`[contact] ignoring test-email: ${email}`);
    return c.json({
      success: true,
      message: 'Danke, deine Nachricht ist angekommen!',
    });
  }

  // Spam-Heuristik: URLs in Nachricht → als 'spam' markieren (nicht blockieren)
  const urlMatches = message.match(URL_REGEX) || [];
  const isLikelySpam = urlMatches.length >= 2;

  const ua = (c.req.header('user-agent') || '').slice(0, 200);
  const subject = `Kontaktformular: ${name.slice(0, 80)}`;

  try {
    await db.insert(schema.inboundEmails).values({
      direction: 'in',
      fromEmail: email.slice(0, 254),
      fromName: name.slice(0, 200),
      toEmail: 'support@herzblatt-journal.de',
      subject: subject.slice(0, 500),
      bodyText: message.slice(0, 100_000),
      bodyHtml: null,
      messageId: null,
      inReplyTo: null,
      threadId: `contact-form-${email}-${Date.now()}`.slice(0, 200),
      status: isLikelySpam ? 'spam' : 'unread',
      rawPayload: JSON.stringify({
        source: 'contact-form',
        ua,
        ipHash: ipHashVal,
        submittedAt: new Date().toISOString(),
      }).slice(0, 10_000),
    });

    console.log(`[contact] received from ${email}: "${subject.slice(0, 60)}" (spam=${isLikelySpam})`);
    return c.json({
      success: true,
      message: 'Danke, deine Nachricht ist angekommen!',
    });
  } catch (err) {
    console.error('[contact] db error:', err);
    return c.json(
      { success: false, message: 'Ein Fehler ist aufgetreten. Bitte versuch es später erneut.' },
      500,
    );
  }
});

export default app;
