import { Hono } from 'hono';
import { count, desc, gt, sql } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';

const app = new Hono();

app.get('/', async (c) => {
  const daysParam = Number(c.req.query('days') || '30');
  const days = isFinite(daysParam) && daysParam > 0 && daysParam <= 365 ? daysParam : 30;

  const cutoff = new Date(Date.now() - days * 86_400_000);

  const rows = await db
    .select({
      source: schema.clicks.source,
      n: count().as('n'),
    })
    .from(schema.clicks)
    .where(gt(schema.clicks.ts, cutoff))
    .groupBy(schema.clicks.source)
    .orderBy(desc(sql`n`))
    .limit(25);

  return c.json({
    ok: true,
    sources: rows.map(r => ({ source: r.source || 'unknown', count: Number(r.n) })),
  });
});

export default app;
