import { Hono } from 'hono';
import { z } from 'zod';
import { count as drizzleCount } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { logAudit } from '../../lib/audit.js';

const app = new Hono();

/**
 * Explizite Bestätigungsphrase für destruktive Aktionen.
 * Muss im Request-Body genau so stehen — kein Trim, kein Case-Insensitive-Match.
 * Das ist die Zweit-Barriere neben der Session-Auth, damit ein XSS-Angreifer
 * oder ein versehentlicher POST kein Komplett-Wipe auslösen kann.
 */
const CONFIRMATION_PHRASE = 'LOESCHEN';

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
  /**
   * Muss wörtlich "LOESCHEN" sein. Schützt gegen versehentliche oder via XSS
   * ausgelöste POSTs — der Admin muss das Wort explizit im Frontend-Prompt
   * eintippen; ein stored-XSS-Payload kann es nicht ohne User-Interaktion
   * liefern.
   */
  confirmationPhrase: z.string(),
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

  // Bestätigungsphrase exakt prüfen (case-sensitive, kein Trim)
  if (parsed.data.confirmationPhrase !== CONFIRMATION_PHRASE) {
    // Fehlversuch loggen — evtl. XSS-Payload-Versuch oder User-Typo
    void logAudit(c, {
      action: 'data.clear.denied',
      target: parsed.data.target,
      meta: { reason: 'confirmation-phrase-mismatch' },
    });
    return c.json(
      { ok: false, message: 'Bestätigungsphrase falsch. Bitte "LOESCHEN" exakt eintippen.' },
      403,
    );
  }

  try {
    let deletedCount = 0;
    switch (parsed.data.target) {
      case 'pageviews': {
        const [{ n }] = await db.select({ n: drizzleCount() }).from(schema.pageviews);
        deletedCount = Number(n || 0);
        await db.delete(schema.pageviews);
        break;
      }
      case 'clicks': {
        const [{ n }] = await db.select({ n: drizzleCount() }).from(schema.clicks);
        deletedCount = Number(n || 0);
        await db.delete(schema.clicks);
        break;
      }
      case 'registrations': {
        const [{ n }] = await db.select({ n: drizzleCount() }).from(schema.registrations);
        deletedCount = Number(n || 0);
        await db.delete(schema.registrations);
        break;
      }
      case 'daily-stats':
        // Gibt keine daily-stats-tabelle in der DB — no-op
        break;
    }

    // Erfolgreicher Löschvorgang als audit-log-Eintrag persistieren
    void logAudit(c, {
      action: 'data.clear',
      target: parsed.data.target,
      meta: { count_deleted: deletedCount },
    });

    return c.json({ ok: true, cleared: parsed.data.target, count: deletedCount });
  } catch (err) {
    console.error('[data/clear] db error:', err);
    return c.json({ ok: false, message: 'Fehler beim Löschen.' }, 500);
  }
});

export default app;
