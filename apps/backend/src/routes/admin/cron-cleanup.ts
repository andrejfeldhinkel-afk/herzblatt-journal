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
 *
 * Response: JSON mit Counters der gelöschten/upgedateten Rows.
 *
 * Sinnvolle Schedule: alle 6 Stunden.
 *   cron: "0 /6 * * *"  (echter Ausdruck: ersetze "/6" durch Stern-Slash-6)
 */
import { Hono } from 'hono';
import { lt, sql } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';

const app = new Hono();

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
