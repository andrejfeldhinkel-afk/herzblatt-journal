import { Hono } from 'hono';
import { z } from 'zod';
import { db, schema } from '../../db/index.js';

const app = new Hono();

app.get('/export', async (c) => {
  const [pageviews, clicks, registrations, subscribers] = await Promise.all([
    db.select().from(schema.pageviews),
    db.select().from(schema.clicks),
    db.select().from(schema.registrations),
    db.select().from(schema.subscribers),
  ]);

  const bundle = {
    exportedAt: new Date().toISOString(),
    pageviews,
    clicks,
    registrations,
    newsletter: subscribers.map(s => ({
      timestamp: s.createdAt,
      email: s.email,
      source: s.source,
      user_agent: s.userAgent || '',
      ip_hash: s.ipHash || '',
    })),
  };

  return new Response(JSON.stringify(bundle, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="herzraum-export-${new Date().toISOString().slice(0,10)}.json"`,
      'Cache-Control': 'no-store',
    },
  });
});

const clearSchema = z.object({
  target: z.enum(['pageviews', 'clicks', 'registrations', 'daily-stats']),
});

app.post('/clear', async (c) => {
  const ct = c.req.header('content-type') || '';
  if (!ct.includes('application/json')) {
    return c.json({ ok: false, message: 'Invalid content type.' }, 400);
  }

  let body: unknown;
  try { body = await c.req.json(); }
  catch { return c.json({ ok: false, message: 'Ungültige Daten.' }, 400); }

  const parsed = clearSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, message: 'Unbekannter Datentyp.' }, 400);
  }

  try {
    switch (parsed.data.target) {
      case 'pageviews':
        await db.delete(schema.pageviews);
        break;
      case 'clicks':
        await db.delete(schema.clicks);
        break;
      case 'registrations':
        await db.delete(schema.registrations);
        break;
      case 'daily-stats':
        // Gibt keine daily-stats-tabelle in der DB — no-op
        break;
    }
    return c.json({ ok: true, cleared: parsed.data.target });
  } catch (err) {
    console.error('[data/clear] db error:', err);
    return c.json({ ok: false, message: 'Fehler beim Löschen.' }, 500);
  }
});

export default app;
