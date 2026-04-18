import { Hono } from 'hono';
import { desc, isNull, count } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';

const app = new Hono();

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  return `${local.slice(0, 1)}***@${domain}`;
}

app.get('/list', async (c) => {
  const mask = c.req.query('mask') !== 'false';
  const includeUnsubscribed = c.req.query('includeUnsubscribed') === 'true';

  // Bug #2: Standardmäßig nur aktive Subscriber zeigen (nicht unsubscribed)
  const rows = await db
    .select({
      email: schema.subscribers.email,
      createdAt: schema.subscribers.createdAt,
      source: schema.subscribers.source,
    })
    .from(schema.subscribers)
    .where(includeUnsubscribed ? undefined : isNull(schema.subscribers.unsubscribedAt))
    .orderBy(desc(schema.subscribers.createdAt))
    .limit(1000);

  // Echten Total aus DB holen (Bug: vorher rows.length → max 1000)
  const [totalRow] = await db
    .select({ n: count() })
    .from(schema.subscribers)
    .where(includeUnsubscribed ? undefined : isNull(schema.subscribers.unsubscribedAt));
  const total = Number(totalRow?.n || 0);

  const entries = rows.map(r => ({
    email: mask ? maskEmail(r.email) : r.email,
    ts: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    source: r.source || 'unknown',
  }));

  return c.json({ ok: true, entries, total });
});

app.get('/export', async (c) => {
  const rows = await db
    .select({
      email: schema.subscribers.email,
      createdAt: schema.subscribers.createdAt,
      source: schema.subscribers.source,
    })
    .from(schema.subscribers)
    .orderBy(desc(schema.subscribers.createdAt));

  const lines = ['email,timestamp,source'];
  for (const r of rows) {
    const email = r.email.includes(',') ? '"' + r.email.replace(/"/g, '""') + '"' : r.email;
    const src = (r.source || '').includes(',') ? '"' + (r.source || '').replace(/"/g, '""') + '"' : (r.source || '');
    const ts = r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt;
    lines.push(`${email},${ts},${src}`);
  }

  return new Response(lines.join('\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="herzblatt-subscribers-${new Date().toISOString().slice(0,10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
});

export default app;
