/**
 * Herzraum-Inbox — Liste + Detail + Reply + Status-Update.
 * Session-Cookie-Auth (via /herzraum/* middleware).
 *
 *   GET    /herzraum/inbox                     → Liste (filter: status, search)
 *   GET    /herzraum/inbox/unread-count        → Counter für nav-badge
 *   GET    /herzraum/inbox/:id                 → Einzelmail + threads
 *   PATCH  /herzraum/inbox/:id/status          → status ändern (read, archived, spam)
 *   POST   /herzraum/inbox/:id/reply           → Reply via SendGrid senden
 *   DELETE /herzraum/inbox/:id                 → löschen (permanent)
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { desc, eq, and, sql, or, ilike } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { logAudit } from '../../lib/audit.js';

const app = new Hono();

// ─── LISTE ──────────────────────────────────────────────

app.get('/', async (c) => {
  const status = c.req.query('status') || 'all';
  const search = c.req.query('q') || '';
  const limitRaw = Number(c.req.query('limit') || '100');
  const limit = Math.min(Math.max(limitRaw, 1), 500);

  const conditions: any[] = [];
  if (status && status !== 'all') {
    conditions.push(eq(schema.inboundEmails.status, status));
  } else {
    // Default: kein spam anzeigen im "all"-Filter
    conditions.push(sql`${schema.inboundEmails.status} != 'spam'`);
  }
  if (search) {
    conditions.push(or(
      ilike(schema.inboundEmails.subject, `%${search}%`),
      ilike(schema.inboundEmails.fromEmail, `%${search}%`),
      ilike(schema.inboundEmails.bodyText, `%${search}%`),
    ));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: schema.inboundEmails.id,
      receivedAt: schema.inboundEmails.receivedAt,
      direction: schema.inboundEmails.direction,
      fromEmail: schema.inboundEmails.fromEmail,
      fromName: schema.inboundEmails.fromName,
      subject: schema.inboundEmails.subject,
      bodyText: schema.inboundEmails.bodyText,
      status: schema.inboundEmails.status,
      threadId: schema.inboundEmails.threadId,
    })
    .from(schema.inboundEmails)
    .where(where)
    .orderBy(desc(schema.inboundEmails.receivedAt))
    .limit(limit);

  // Preview: erste 200 Zeichen body
  const items = rows.map((r) => ({
    ...r,
    receivedAt: r.receivedAt instanceof Date ? r.receivedAt.toISOString() : r.receivedAt,
    preview: (r.bodyText || '').replace(/\s+/g, ' ').trim().slice(0, 200),
    bodyText: undefined, // nicht in Listen-Response (Bandwidth sparen)
  }));

  return c.json({ ok: true, total: items.length, items });
});

// ─── UNREAD COUNTER ─────────────────────────────────────

app.get('/unread-count', async (c) => {
  const rows = await db.execute(sql`
    SELECT COUNT(*)::int AS cnt FROM inbound_emails WHERE status = 'unread'
  `);
  const cnt = Number((rows as any)[0]?.cnt || 0);
  return c.json({ ok: true, count: cnt });
});

// ─── EINZELMAIL + THREAD ────────────────────────────────

app.get('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return c.json({ ok: false, error: 'invalid-id' }, 400);

  const [mail] = await db
    .select()
    .from(schema.inboundEmails)
    .where(eq(schema.inboundEmails.id, id))
    .limit(1);

  if (!mail) return c.json({ ok: false, error: 'not-found' }, 404);

  // Thread-Messages holen (alle mit gleichem threadId, inkl. unseren Out-Messages)
  const threadMessages = mail.threadId
    ? await db
        .select()
        .from(schema.inboundEmails)
        .where(eq(schema.inboundEmails.threadId, mail.threadId))
        .orderBy(schema.inboundEmails.receivedAt)
    : [mail];

  // Mail automatisch als 'read' markieren
  if (mail.status === 'unread') {
    await db
      .update(schema.inboundEmails)
      .set({ status: 'read' })
      .where(eq(schema.inboundEmails.id, id));
  }

  return c.json({
    ok: true,
    mail: {
      ...mail,
      receivedAt: mail.receivedAt instanceof Date ? mail.receivedAt.toISOString() : mail.receivedAt,
    },
    thread: threadMessages.map((m) => ({
      ...m,
      receivedAt: m.receivedAt instanceof Date ? m.receivedAt.toISOString() : m.receivedAt,
      rawPayload: undefined, // privacy + size
    })),
  });
});

// ─── STATUS UPDATE ──────────────────────────────────────

const statusSchema = z.object({
  status: z.enum(['unread', 'read', 'replied', 'archived', 'spam']),
});

app.patch('/:id/status', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return c.json({ ok: false, error: 'invalid-id' }, 400);

  let body: unknown;
  try { body = await c.req.json(); }
  catch { return c.json({ ok: false, error: 'invalid-json' }, 400); }

  const parsed = statusSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'validation', issues: parsed.error.issues }, 400);

  await db
    .update(schema.inboundEmails)
    .set({ status: parsed.data.status })
    .where(eq(schema.inboundEmails.id, id));

  void logAudit(c, { action: 'inbox.status', target: String(id), meta: { status: parsed.data.status } });

  return c.json({ ok: true, id, status: parsed.data.status });
});

// ─── REPLY ──────────────────────────────────────────────

const replySchema = z.object({
  subject: z.string().min(1).max(500).optional(),
  bodyText: z.string().min(1).max(50_000),
  bodyHtml: z.string().max(200_000).optional(),
});

app.post('/:id/reply', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return c.json({ ok: false, error: 'invalid-id' }, 400);

  let body: unknown;
  try { body = await c.req.json(); }
  catch { return c.json({ ok: false, error: 'invalid-json' }, 400); }

  const parsed = replySchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'validation', issues: parsed.error.issues }, 400);

  const [original] = await db
    .select()
    .from(schema.inboundEmails)
    .where(eq(schema.inboundEmails.id, id))
    .limit(1);
  if (!original) return c.json({ ok: false, error: 'not-found' }, 404);

  const sgKey = process.env.SENDGRID_API_KEY;
  if (!sgKey) return c.json({ ok: false, error: 'SENDGRID_API_KEY not configured' }, 500);

  const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'support@herzblatt-journal.de';
  const fromName = process.env.SENDGRID_FROM_NAME || 'Herzblatt Journal';

  const subjectRaw = (parsed.data.subject || original.subject || '(keine Betreffzeile)').trim();
  const subject = /^re[: ]/i.test(subjectRaw) ? subjectRaw : `Re: ${subjectRaw}`;

  const bodyTextWithQuote = parsed.data.bodyText + '\n\n\n' +
    '---\n' +
    `Am ${original.receivedAt instanceof Date ? original.receivedAt.toLocaleString('de-DE') : original.receivedAt} schrieb ${original.fromName || original.fromEmail}:\n\n` +
    '> ' + (original.bodyText || '').split('\n').join('\n> ');

  const htmlBody = parsed.data.bodyHtml || parsed.data.bodyText.split('\n').map((l) => `<p>${l.replace(/</g, '&lt;')}</p>`).join('\n');

  // Headers für Threading (RFC 5322)
  const headers: Record<string, string> = {};
  if (original.messageId) {
    headers['In-Reply-To'] = original.messageId.startsWith('<') ? original.messageId : `<${original.messageId}>`;
    headers['References'] = original.messageId.startsWith('<') ? original.messageId : `<${original.messageId}>`;
  }

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${sgKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: { email: fromEmail, name: fromName },
      personalizations: [{ to: [{ email: original.fromEmail }] }],
      subject,
      content: [
        { type: 'text/plain', value: bodyTextWithQuote },
        { type: 'text/html', value: htmlBody },
      ],
      headers,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    return c.json({ ok: false, error: `SendGrid ${res.status}: ${errText}` }, 500);
  }

  // Reply als outbound-mail in DB speichern, im gleichen Thread
  await db.insert(schema.inboundEmails).values({
    direction: 'out',
    fromEmail,
    fromName,
    toEmail: original.fromEmail,
    subject,
    bodyText: parsed.data.bodyText,
    bodyHtml: htmlBody,
    inReplyTo: original.messageId,
    threadId: original.threadId,
    status: 'read', // outbound ist immer "read"
  });

  // Original als 'replied' markieren
  await db
    .update(schema.inboundEmails)
    .set({ status: 'replied' })
    .where(eq(schema.inboundEmails.id, id));

  void logAudit(c, { action: 'inbox.reply', target: String(id), meta: { to: original.fromEmail, subject } });

  return c.json({ ok: true, to: original.fromEmail, subject, sgStatus: res.status });
});

// ─── DELETE ─────────────────────────────────────────────

app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return c.json({ ok: false, error: 'invalid-id' }, 400);

  const r = await db
    .delete(schema.inboundEmails)
    .where(eq(schema.inboundEmails.id, id))
    .returning({ id: schema.inboundEmails.id });

  if (r.length === 0) return c.json({ ok: false, error: 'not-found' }, 404);

  void logAudit(c, { action: 'inbox.delete', target: String(id) });

  return c.json({ ok: true, id });
});

export default app;
