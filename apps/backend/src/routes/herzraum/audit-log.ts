/**
 * GET /herzraum/audit-log?limit=100
 * Listet die letzten Admin-Actions. Session-Cookie-Auth.
 */
import { Hono } from 'hono';
import { desc } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';

const app = new Hono();

app.get('/', async (c) => {
  const limitRaw = Number(c.req.query('limit') || '100');
  const limit = Math.min(Math.max(limitRaw, 1), 500);

  try {
    const rows = await db
      .select({
        id: schema.auditLog.id,
        ts: schema.auditLog.ts,
        actor: schema.auditLog.actor,
        action: schema.auditLog.action,
        target: schema.auditLog.target,
        meta: schema.auditLog.meta,
      })
      .from(schema.auditLog)
      .orderBy(desc(schema.auditLog.ts))
      .limit(limit);

    return c.json({
      ok: true,
      total: rows.length,
      items: rows.map((r) => ({
        ...r,
        ts: r.ts instanceof Date ? r.ts.toISOString() : r.ts,
        meta: r.meta ? (() => { try { return JSON.parse(r.meta!); } catch { return r.meta; } })() : null,
      })),
    });
  } catch (err) {
    console.error('[audit-log] error:', err);
    return c.json({ ok: false, error: String(err) }, 500);
  }
});

export default app;
