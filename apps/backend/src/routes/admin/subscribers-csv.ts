import { Hono } from 'hono';
import { desc } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';

const app = new Hono();

app.get('/', async (c) => {
  const rows = await db
    .select({
      email: schema.subscribers.email,
      createdAt: schema.subscribers.createdAt,
      source: schema.subscribers.source,
      userAgent: schema.subscribers.userAgent,
      ipHash: schema.subscribers.ipHash,
    })
    .from(schema.subscribers)
    .orderBy(desc(schema.subscribers.createdAt));

  const esc = (v: string | null | undefined): string => {
    if (!v) return '';
    if (/[",\n\r]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
    return v;
  };

  const lines = ['timestamp,email,source,user_agent,ip_hash'];
  for (const r of rows) {
    const ts = r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt;
    lines.push([
      esc(String(ts)),
      esc(r.email),
      esc(r.source || ''),
      esc(r.userAgent || ''),
      esc(r.ipHash || ''),
    ].join(','));
  }

  return new Response(lines.join('\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="subscribers.csv"',
      'Cache-Control': 'no-store',
    },
  });
});

export default app;
