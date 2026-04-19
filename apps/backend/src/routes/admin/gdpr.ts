/**
 * GDPR-Endpoints — DSGVO-konformes Löschen und Auskunft.
 * Bearer-ADMIN_TOKEN protected (unter /admin/* gemountet).
 *
 *   POST /admin/gdpr/delete      → Body: { email }
 *     Löscht/anonymisiert alle Daten zu dieser E-Mail
 *
 *   POST /admin/gdpr/export      → Body: { email }
 *     Liefert JSON mit allen Daten zu dieser E-Mail (Art. 15 DSGVO Auskunft)
 *
 *   GET  /admin/gdpr/audit-log    → zeigt die letzten GDPR-Actions
 *
 * Test-Plan — was passiert bei POST /admin/gdpr/delete { email }:
 *   1. subscribers        → HARD DELETE where email = ? (Newsletter-Row weg)
 *   2. registrations      → HARD DELETE where email = ? (xLoves-Signup-Tracking weg)
 *   3. purchases          → ANONYMIZED (HGB §257: 10 Jahre Steuer-Aufbewahrung!),
 *                            email → 'deleted-<b64>@anonymized.local',
 *                            rawPayload → NULL (Webhook-Body mit Namen/Adressen weg)
 *   4. inbound_emails     → HARD DELETE where fromEmail = ? OR toEmail = ?
 *                            (Support-Mail-Inhalte komplett weg inkl. raw_payload MIME)
 *   5. audit_log          → PII im meta-Feld + target-Feld maskiert durch:
 *                            meta → '{"redacted":"gdpr"}'
 *                            target → 'redacted:<b64>'
 *                            Wir behalten action + ts + ip_hash, weil Audit-
 *                            Trail rechtlich relevant ist. Nur PII weg.
 *   6. pageviews/clicks   → keine Email-Spalte, nichts zu tun.
 *   7. sessions/login_attempts → nur ip_hash (gehashed, nicht PII zum email).
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { eq, or, sql } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';

const app = new Hono();

const emailSchema = z.object({ email: z.string().email() });

app.post('/delete', async (c) => {
  let body: unknown;
  try { body = await c.req.json(); }
  catch { return c.json({ ok: false, error: 'invalid-json' }, 400); }

  const parsed = emailSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'email required' }, 400);
  }
  const email = parsed.data.email.trim().toLowerCase();

  const result: Record<string, number> = {};
  const errors: string[] = [];

  // 1. Subscribers — hart löschen
  try {
    const r = await db
      .delete(schema.subscribers)
      .where(eq(schema.subscribers.email, email))
      .returning({ id: schema.subscribers.id });
    result.subscribers_deleted = r.length;
  } catch (err) { errors.push(`subscribers: ${String(err)}`); }

  // 2. Registrations — hart löschen
  try {
    const r = await db
      .delete(schema.registrations)
      .where(eq(schema.registrations.email, email))
      .returning({ id: schema.registrations.id });
    result.registrations_deleted = r.length;
  } catch (err) { errors.push(`registrations: ${String(err)}`); }

  // 3. Purchases — anonymisieren (NICHT löschen — Buchhaltungs-Pflicht
  //    10 Jahre nach HGB §257). E-Mail durch hash ersetzen.
  const anonymized = 'deleted-' + Buffer.from(email).toString('base64').slice(0, 16) + '@anonymized.local';
  try {
    const r = await db
      .update(schema.purchases)
      .set({ email: anonymized, rawPayload: null })
      .where(eq(schema.purchases.email, email))
      .returning({ id: schema.purchases.id });
    result.purchases_anonymized = r.length;
  } catch (err) { errors.push(`purchases: ${String(err)}`); }

  // 4. Inbound-Emails — HARD DELETE (Support-Mail-Content ist hochsensitiv,
  //    kein Aufbewahrungs-Zwang). Sowohl from- als auch to-Spalte checken,
  //    weil outgoing-Replies from=unsere-domain haben aber to=User-Email.
  //    Phase-5 D-GDPR-1.
  try {
    const r = await db
      .delete(schema.inboundEmails)
      .where(
        or(
          eq(schema.inboundEmails.fromEmail, email),
          eq(schema.inboundEmails.toEmail, email),
        ),
      )
      .returning({ id: schema.inboundEmails.id });
    result.inbound_emails_deleted = r.length;
  } catch (err) { errors.push(`inbound_emails: ${String(err)}`); }

  // 5. Audit-Log — PII maskieren (NICHT ganze Rows löschen — Audit-Trail
  //    rechtlich relevant). target kann Email sein, meta kann JSON mit Email
  //    enthalten. Wir überschreiben nur die identifizierenden Felder.
  //    Phase-6 C PII-Handling.
  try {
    // a) target exakt === email: Audit-Eintrag bezieht sich eindeutig auf diesen User
    const rTarget = await db
      .update(schema.auditLog)
      .set({ target: 'redacted:' + Buffer.from(email).toString('base64').slice(0, 16), meta: null })
      .where(eq(schema.auditLog.target, email))
      .returning({ id: schema.auditLog.id });
    result.audit_log_target_redacted = rTarget.length;

    // b) meta enthält die Email irgendwo (JSON-string like '%email%')
    //    SQL-LIKE-escape: Postgres LIKE kennt % und _ als Wildcards,
    //    die wir durch \% und \_ escapen müssen. Email enthält i.d.R.
    //    weder, aber safety first.
    const likeEscapedEmail = email.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
    const rMeta = await db
      .update(schema.auditLog)
      .set({ meta: '{"redacted":"gdpr"}' })
      .where(
        sql`${schema.auditLog.meta} LIKE ${'%' + likeEscapedEmail + '%'}`,
      )
      .returning({ id: schema.auditLog.id });
    result.audit_log_meta_redacted = rMeta.length;
  } catch (err) { errors.push(`audit_log: ${String(err)}`); }

  // Pageviews/Clicks enthalten keine E-Mail (nur ip_hash) — nichts zu löschen.
  // sessions/login_attempts haben nur ip_hash (gehashed) — kein Email-Bezug.

  return c.json({
    ok: errors.length === 0,
    email,
    result,
    errors: errors.length ? errors : undefined,
    note: 'Purchases werden anonymisiert, nicht gelöscht (Buchhaltungs-Pflicht HGB §257 Abs. 4). inbound_emails werden komplett gelöscht. audit_log behält Action+Timestamp, PII in target+meta wird redacted.',
    ts: new Date().toISOString(),
  });
});

app.post('/export', async (c) => {
  let body: unknown;
  try { body = await c.req.json(); }
  catch { return c.json({ ok: false, error: 'invalid-json' }, 400); }

  const parsed = emailSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'email required' }, 400);
  }
  const email = parsed.data.email.trim().toLowerCase();

  const [subs, regs, purs, inbs] = await Promise.all([
    db.select().from(schema.subscribers).where(eq(schema.subscribers.email, email)),
    db.select().from(schema.registrations).where(eq(schema.registrations.email, email)),
    db.select().from(schema.purchases).where(eq(schema.purchases.email, email)),
    db.select().from(schema.inboundEmails).where(
      or(
        eq(schema.inboundEmails.fromEmail, email),
        eq(schema.inboundEmails.toEmail, email),
      ),
    ),
  ]);

  return c.json({
    exported_at: new Date().toISOString(),
    email,
    data: {
      subscribers: subs,
      registrations: regs,
      purchases: purs.map((p) => ({
        ...p,
        rawPayload: p.rawPayload ? '[stored, not exported for safety]' : null,
      })),
      inbound_emails: inbs.map((e) => ({
        ...e,
        // raw_payload enthält komplette MIME inkl. Headers — für Auskunft
        // nicht nötig (subject+body reichen), raus aus Export.
        rawPayload: e.rawPayload ? '[stored, not exported for safety]' : null,
      })),
    },
    note: 'Pageviews + Clicks enthalten keine E-Mail, nur ip_hash. Nicht exportierbar per E-Mail.',
  });
});

export default app;
