import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { getClientIp, hashIp } from '../lib/crypto.js';
import { allowRequest } from '../lib/rate-limit.js';

const app = new Hono();

// 60 GET-Requests pro Minute pro IP — /readers macht bei jedem Call
// einen DB-Write (UPDATE readers_counter), trivialer DB-Hammer ohne Limit.
function allowReaders(ipHash: string): boolean {
  return allowRequest('rdrs:' + ipHash, 60, 60_000);
}

app.get('/', async (c) => {
  const ip = getClientIp(c.req.raw, c.req.raw.headers);
  if (!allowReaders(hashIp(ip))) {
    console.warn('[readers] rate-limit hit');
    return c.json({ error: 'rate-limit' }, 429, { 'Retry-After': '60' });
  }

  try {
    // Hole oder initialisiere die einzige Row
    const rows = await db.select().from(schema.readersCounter).limit(1);
    const now = new Date();

    if (rows.length === 0) {
      // Erstmalig: Initial-Insert
      const inserted = await db
        .insert(schema.readersCounter)
        .values({ count: 12847, lastUpdated: now })
        .returning();
      return c.json({ count: inserted[0].count }, 200, { 'Cache-Control': 'no-cache' });
    }

    const row = rows[0];
    const last = new Date(row.lastUpdated);
    const hoursDiff = (now.getTime() - last.getTime()) / (1000 * 60 * 60);

    // ~50-150 readers pro Stunde (natural growth simulation)
    const growth = Math.max(1, Math.floor(hoursDiff * (50 + Math.random() * 100)));
    const cappedGrowth = Math.min(growth, 500);

    const newCount = row.count + cappedGrowth;

    await db
      .update(schema.readersCounter)
      .set({ count: newCount, lastUpdated: now })
      .where(eq(schema.readersCounter.id, row.id));

    return c.json({ count: newCount }, 200, { 'Cache-Control': 'no-cache' });
  } catch (err) {
    console.error('[readers] db error:', err);
    // Fallback-Wert bei DB-Problemen
    return c.json({ count: 12847 }, 200);
  }
});

export default app;
