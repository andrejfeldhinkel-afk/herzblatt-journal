/**
 * POST /admin/cron/cleanup
 *
 * Housekeeping-Endpoint, der von einem Railway Cron-Service (oder einem
 * externen Scheduler wie cron-job.org, GitHub-Actions-Schedule, EasyCron)
 * periodisch getriggert wird.
 *
 * Protected via ADMIN_TOKEN (Bearer), genauso wie /admin/subscribers.csv.
 *
 * Housekeeping-Tasks:
 *  1. Abgelaufene Sessions löschen (expires_at < now)
 *  2. Alte Login-Attempts löschen (> 7 Tage alt)
 *  3. Readers-Counter leicht inkrementieren (für Homepage-Schein)
 *  4. Data-Retention (Phase-5 HIGH + Phase-6 D HIGH):
 *     - pageviews > 90 Tage   → löschen
 *     - clicks > 90 Tage      → löschen
 *     - audit_log > 180 Tage  → löschen (Audit-Trail länger halten)
 *     - inbound_emails > 365d → löschen (Email-Archiv)
 *  5. DSGVO Art. 17 Datenminimierung:
 *     - subscribers WHERE unsubscribed_at < now-180d  → komplett löschen
 *       (kein Bestandsinteresse mehr; Welcome+Goodbye Mails längst raus)
 *
 * Alle Retention-Deletes sind mit LIMIT 10.000 pro Run abgesichert, damit
 * wir bei initialer Aufräum-Welle (viele Millionen alte Rows) die DB
 * nicht locken. Cron muss idempotent mehrfach laufen können.
 *
 * Response: JSON mit Counters der gelöschten/upgedateten Rows.
 *
 * Sinnvolle Schedule: alle 6 Stunden.
 *   cron: "0 /6 * * *"  (echter Ausdruck: ersetze "/6" durch Stern-Slash-6)
 */
import { Hono } from 'hono';
import { and, isNotNull, lt, sql } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';

const app = new Hono();

// Max zu löschende Rows pro Tabelle pro Cron-Run. Verhindert DB-Lock bei
// initialer Retention-Welle auf bestehenden Datenbeständen. Bei >10k
// aufgestauten alten Rows laufen weitere Runs bis alles abgearbeitet ist.
const MAX_DELETE_PER_RUN = 10_000;

/**
 * Data-Retention Cleanup: löscht alle Tables die eine Retention-Policy haben.
 * Idempotent, mehrfach ausführbar.
 *
 * Wird sowohl vom POST als auch vom GET-Handler aufgerufen.
 *
 * Implementierung: DELETE ... WHERE id IN (SELECT id ... LIMIT N) damit der
 * LIMIT-Cap funktioniert (Postgres erlaubt kein DELETE ... LIMIT direkt).
 * RETURNING id → r.length = Anzahl gelöschter Rows.
 */
async function runRetentionCleanup(
  results: Record<string, unknown>,
  errors: string[],
): Promise<void> {
  const now = Date.now();

  // pageviews: 90 Tage rolling
  try {
    const cutoff = new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString();
    const r = await db.execute(sql`
      DELETE FROM pageviews
      WHERE id IN (
        SELECT id FROM pageviews
        WHERE ts < ${cutoff}
        LIMIT ${MAX_DELETE_PER_RUN}
      )
      RETURNING id
    `);
    results.pageviewsDeleted = Array.isArray(r) ? r.length : 0;
  } catch (err) {
    errors.push(`pageviews_retention: ${String(err)}`);
  }

  // clicks: 90 Tage rolling
  try {
    const cutoff = new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString();
    const r = await db.execute(sql`
      DELETE FROM clicks
      WHERE id IN (
        SELECT id FROM clicks
        WHERE ts < ${cutoff}
        LIMIT ${MAX_DELETE_PER_RUN}
      )
      RETURNING id
    `);
    results.clicksDeleted = Array.isArray(r) ? r.length : 0;
  } catch (err) {
    errors.push(`clicks_retention: ${String(err)}`);
  }

  // audit_log: 180 Tage rolling — Audit-Trail länger behalten
  try {
    const cutoff = new Date(now - 180 * 24 * 60 * 60 * 1000).toISOString();
    const r = await db.execute(sql`
      DELETE FROM audit_log
      WHERE id IN (
        SELECT id FROM audit_log
        WHERE ts < ${cutoff}
        LIMIT ${MAX_DELETE_PER_RUN}
      )
      RETURNING id
    `);
    results.auditLogDeleted = Array.isArray(r) ? r.length : 0;
  } catch (err) {
    errors.push(`audit_log_retention: ${String(err)}`);
  }

  // inbound_emails: 365 Tage rolling
  try {
    const cutoff = new Date(now - 365 * 24 * 60 * 60 * 1000).toISOString();
    const r = await db.execute(sql`
      DELETE FROM inbound_emails
      WHERE id IN (
        SELECT id FROM inbound_emails
        WHERE received_at < ${cutoff}
        LIMIT ${MAX_DELETE_PER_RUN}
      )
      RETURNING id
    `);
    results.inboundEmailsDeleted = Array.isArray(r) ? r.length : 0;
  } catch (err) {
    errors.push(`inbound_emails_retention: ${String(err)}`);
  }

  // DSGVO Art. 17 Datenminimierung: Subscribers, die seit > 180 Tagen
  // unsubscribed sind, komplett aus der DB löschen. Begründung: nach
  // Abmeldung gibt es kein berechtigtes Interesse mehr, Email + IP-Hash
  // weiter vorzuhalten. Welcome- und Goodbye-Mail sind längst zugestellt.
  //
  // SAFETY:
  //   - WHERE unsubscribed_at IS NOT NULL → niemals aktive Subs löschen
  //   - WHERE unsubscribed_at < cutoff    → 180-Tage-Karenz für Re-Anmelder
  //   - Drizzle delete via Schema (typed), nicht raw SQL — kein Injection-Risk
  try {
    const cutoff = new Date(now - 180 * 24 * 60 * 60 * 1000);
    const deleted = await db
      .delete(schema.subscribers)
      .where(
        and(
          isNotNull(schema.subscribers.unsubscribedAt),
          lt(schema.subscribers.unsubscribedAt, cutoff),
        ),
      )
      .returning({ id: schema.subscribers.id });
    results.unsubscribedSubscribersDeleted = deleted.length;
  } catch (err) {
    errors.push(`subscribers_data_minimization: ${String(err)}`);
  }
}

app.post('/', async (c) => {
  const start = Date.now();
  const results: Record<string, unknown> = {};
  const errors: string[] = [];

  // 1. Expired Sessions löschen
  try {
    const expiredRows = await db
      .delete(schema.sessions)
      .where(lt(schema.sessions.expiresAt, new Date()))
      .returning({ id: schema.sessions.id });
    results.expiredSessionsDeleted = expiredRows.length;
  } catch (err) {
    errors.push(`sessions: ${String(err)}`);
  }

  // 2. Login-Attempts älter als 7 Tage löschen
  try {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const oldAttempts = await db
      .delete(schema.loginAttempts)
      .where(lt(schema.loginAttempts.ts, cutoff))
      .returning({ id: schema.loginAttempts.id });
    results.oldLoginAttemptsDeleted = oldAttempts.length;
  } catch (err) {
    errors.push(`login_attempts: ${String(err)}`);
  }

  // 3. Readers-Counter leicht inkrementieren (zufällig +2..+8 pro Run)
  try {
    const bump = Math.floor(Math.random() * 7) + 2;
    await db.execute(sql`
      UPDATE readers_counter
      SET count = count + ${bump},
          last_updated = NOW()
      WHERE id = 1
    `);
    results.readersCounterBump = bump;
  } catch (err) {
    errors.push(`readers_counter: ${String(err)}`);
  }

  // 4. Data-Retention: pageviews/clicks/audit_log/inbound_emails
  await runRetentionCleanup(results, errors);

  const durationMs = Date.now() - start;

  return c.json({
    ok: errors.length === 0,
    durationMs,
    results,
    errors: errors.length ? errors : undefined,
    ts: new Date().toISOString(),
  });
});

// GET als Alias für Scheduler die nur GET können (cron-job.org default)
app.get('/', async (c) => {
  const start = Date.now();
  const results: Record<string, unknown> = {};
  const errors: string[] = [];

  try {
    const expiredRows = await db
      .delete(schema.sessions)
      .where(lt(schema.sessions.expiresAt, new Date()))
      .returning({ id: schema.sessions.id });
    results.expiredSessionsDeleted = expiredRows.length;
  } catch (err) {
    errors.push(`sessions: ${String(err)}`);
  }

  try {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const oldAttempts = await db
      .delete(schema.loginAttempts)
      .where(lt(schema.loginAttempts.ts, cutoff))
      .returning({ id: schema.loginAttempts.id });
    results.oldLoginAttemptsDeleted = oldAttempts.length;
  } catch (err) {
    errors.push(`login_attempts: ${String(err)}`);
  }

  try {
    const bump = Math.floor(Math.random() * 7) + 2;
    await db.execute(sql`
      UPDATE readers_counter
      SET count = count + ${bump},
          last_updated = NOW()
      WHERE id = 1
    `);
    results.readersCounterBump = bump;
  } catch (err) {
    errors.push(`readers_counter: ${String(err)}`);
  }

  // Data-Retention (identisch zum POST-Handler)
  await runRetentionCleanup(results, errors);

  const durationMs = Date.now() - start;

  return c.json({
    ok: errors.length === 0,
    durationMs,
    results,
    errors: errors.length ? errors : undefined,
    ts: new Date().toISOString(),
  });
});

export default app;
