import { Hono } from 'hono';
import { desc } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';

const app = new Hono();

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  return `${local.slice(0, 1)}***@${domain}`;
}

app.get('/', async (c) => {
  const mask = c.req.query('mask') !== 'false';

  const [regs, nlEmails] = await Promise.all([
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
  ]);

  const nlSet = new Set(nlEmails.map(e => e.email.toLowerCase()));
  let overlap = 0;
  const entries = regs.map(r => {
    const isNl = nlSet.has(r.email.toLowerCase());
    if (isNl) overlap++;
    return {
      email: mask ? maskEmail(r.email) : r.email,
      ts: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
      source: r.source || 'unknown',
      newsletter: isNl,
    };
  });

  return c.json({ ok: true, entries, total: regs.length, overlap });
});

export default app;
