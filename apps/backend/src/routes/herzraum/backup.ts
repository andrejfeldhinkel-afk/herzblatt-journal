/**
 * /herzraum/backup — Admin-initiierter DB-Export als JSON.
 *
 * Sicherheitsnetz für den Fall dass die Railway-Postgres-Instanz zerstört
 * wird (gelöschter Service, verlorenes Admin-Password, Provider-Outage).
 * Railway hat keine zugängliche Point-in-Time-Recovery für den Hobby-Tier,
 * also machen wir es selbst.
 *
 * GET /herzraum/backup            → JSON-File zum Download, alles was der
 *                                   Admin zur Wiederherstellung braucht.
 * GET /herzraum/backup/summary    → Zahlen vor Download (Größe abschätzen).
 *
 * Was exportiert wird:
 *   subscribers            (alles)
 *   registrations          (alles)
 *   purchases              (ohne raw_payload — enthält Klartext-Webhooks mit PII)
 *   redirects              (redirect-Setup)
 *   todos                  (offene + erledigte)
 *   inbox_emails           (ohne raw_payload — kann komplette MIME-Body mit
 *                           Anhängen/PII enthalten, sprengt Dateigröße)
 *   newsletter_broadcasts  (bodyHtml wird truncated auf 4 kB, sonst können
 *                           einzelne Broadcasts mehrere MB wiegen)
 *   audit_log              (LETZTE 30 TAGE — vollständiger dump wäre zu groß)
 *   products               (Katalog)
 *   authors                — wird nicht exportiert, ist als TS-File im Repo
 *
 * NICHT exportiert:
 *   sessions               (Security — sollten nach Restore eh neu sein)
 *   login_attempts         (Security)
 *   pageviews/clicks       (zu groß, rebuildbar aus Plausible/Backend-Logs)
 *
 * Der Export ist selbstbeschreibend: JSON mit `schema_version`, `exported_at`,
 * `row_counts`, und `data` pro Tabelle.
 */
import { Hono } from 'hono';
import { desc, gte } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { logAudit } from '../../lib/audit.js';

const app = new Hono();

const BACKUP_SCHEMA_VERSION = 1;
const AUDIT_DAYS = 30;
const BROADCAST_HTML_TRUNCATE = 4096;

// GET /summary — bevor man downloaded, schnelle Counts anzeigen
app.get('/summary', async (c) => {
  const [subs, regs, pur, tod, nlb, inb, pro] = await Promise.all([
    db.$count(schema.subscribers),
    db.$count(schema.registrations),
    db.$count(schema.purchases),
    db.$count(schema.adminTodos),
    db.$count(schema.newsletterBroadcasts),
    db.$count(schema.inboundEmails),
    db.$count(schema.products),
  ]);

  return c.json({
    ok: true,
    counts: {
      subscribers: subs,
      registrations: regs,
      purchases: pur,
      todos: tod,
      newsletter_broadcasts: nlb,
      inbox_emails: inb,
      products: pro,
    },
    note: `Audit-Log wird auf die letzten ${AUDIT_DAYS} Tage begrenzt exportiert. raw_payload in purchases + inbox_emails wird ausgelassen. Redirects sind Code (astro.config.mjs), nicht DB — nicht im Backup.`,
  });
});

// GET / — der eigentliche Download
app.get('/', async (c) => {
  const auditCutoff = new Date(Date.now() - AUDIT_DAYS * 86_400_000);

  const [subs, regs, pur, tod, nlbRaw, inbRaw, pro, aud] = await Promise.all([
    db.select().from(schema.subscribers),
    db.select().from(schema.registrations),
    // Purchases: rawPayload ausschließen (PII + groß)
    db.select({
      id: schema.purchases.id,
      provider: schema.purchases.provider,
      providerOrderId: schema.purchases.providerOrderId,
      email: schema.purchases.email,
      product: schema.purchases.product,
      amountCents: schema.purchases.amountCents,
      currency: schema.purchases.currency,
      status: schema.purchases.status,
      createdAt: schema.purchases.createdAt,
    }).from(schema.purchases),
    db.select().from(schema.adminTodos),
    db.select().from(schema.newsletterBroadcasts),
    // Inbox-Emails: rawPayload ausschließen (kann riesig sein)
    db.select({
      id: schema.inboundEmails.id,
      fromEmail: schema.inboundEmails.fromEmail,
      toEmail: schema.inboundEmails.toEmail,
      subject: schema.inboundEmails.subject,
      bodyText: schema.inboundEmails.bodyText,
      status: schema.inboundEmails.status,
      receivedAt: schema.inboundEmails.receivedAt,
    }).from(schema.inboundEmails),
    db.select().from(schema.products),
    // Audit-Log: nur letzte N Tage
    db
      .select()
      .from(schema.auditLog)
      .where(gte(schema.auditLog.ts, auditCutoff))
      .orderBy(desc(schema.auditLog.ts)),
  ]);

  // Newsletter-Broadcasts: bodyHtml kappen
  const nlb = nlbRaw.map((b) => ({
    ...b,
    bodyHtml: b.bodyHtml && b.bodyHtml.length > BROADCAST_HTML_TRUNCATE
      ? b.bodyHtml.slice(0, BROADCAST_HTML_TRUNCATE) + '\n<!-- truncated for backup, full html in DB -->'
      : b.bodyHtml,
  }));

  const payload = {
    schema_version: BACKUP_SCHEMA_VERSION,
    exported_at: new Date().toISOString(),
    source: 'herzblatt-journal backend /herzraum/backup',
    audit_log_window_days: AUDIT_DAYS,
    excluded_fields: ['purchases.rawPayload', 'inbox_emails.rawPayload', 'newsletter_broadcasts.bodyHtml (truncated)'],
    excluded_tables: ['sessions', 'login_attempts', 'pageviews', 'clicks', 'redirects (nicht DB, sondern astro.config.mjs)'],
    row_counts: {
      subscribers: subs.length,
      registrations: regs.length,
      purchases: pur.length,
      todos: tod.length,
      newsletter_broadcasts: nlb.length,
      inbox_emails: inbRaw.length,
      products: pro.length,
      audit_log: aud.length,
    },
    data: {
      subscribers: subs,
      registrations: regs,
      purchases: pur,
      todos: tod,
      newsletter_broadcasts: nlb,
      inbox_emails: inbRaw,
      products: pro,
      audit_log: aud,
    },
  };

  await logAudit(c, {
    action: 'backup.download',
    meta: {
      row_counts: payload.row_counts,
    },
  });

  const date = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const filename = `herzblatt-backup-${date}.json`;

  // `Content-Length` setzt der Browser aus dem Body selbst; wichtig ist nur
  // Content-Type + Content-Disposition damit der Download-Dialog aufpoppt.
  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
});

export default app;
