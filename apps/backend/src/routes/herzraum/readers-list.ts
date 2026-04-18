import { Hono } from 'hono';
import { desc, count, sql } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';

const app = new Hono();

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  return `${local.slice(0, 1)}***@${domain}`;
}

app.get('/', async (c) => {
  const mask = c.req.query('mask') !== 'false';

  // Bug #4: Overlap + Total aus SQL, nicht aus limited JS-Array.
  // Sonst bei >1000 Regs Overlap-Unterschätzung.
  const [regs, nlEmails, totalRegsRow, overlapRow] = await Promise.all([
    db
      .select({
        email: schema.registrations.email,
        createdAt: schema.registrations.createdAt,
        source: schema.registrations.source,
      })
      .from(schema.registrations)
      .orderBy(desc(schema.registrations.createdAt))
      .limit(1000),
    db
      .select({ email: schema.subscribers.email })
      .from(schema.subscribers),
    db
      .select({ n: count() })
      .from(schema.registrations),
    db.execute<{ n: number }>(sql`
      SELECT COUNT(DISTINCT r.email)::int AS n
      FROM registrations r
      INNER JOIN subscribers s ON LOWER(r.email) = LOWER(s.email)
      WHERE s.unsubscribed_at IS NULL
    `),
  ]);

  const nlSet = new Set(nlEmails.map(e => e.email.toLowerCase()));
  const entries = regs.map(r => ({
    email: mask ? maskEmail(r.email) : r.email,
    ts: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    source: r.source || 'unknown',
    newsletter: nlSet.has(r.email.toLowerCase()),
  }));

  const total = Number(totalRegsRow[0]?.n || 0);
  const overlap = Number((overlapRow as any)[0]?.n || 0);

  return c.json({ ok: true, entries, total, overlap });
});

export default app;
