/**
 * GET /admin/backup.json
 *
 * Vollständiger DB-Snapshot als JSON-Download.
 * Bearer-ADMIN_TOKEN protected.
 *
 * Enthält ALLE Tabellen außer sessions (security!) + login_attempts (Noise).
 *
 * Usage:
 *   curl -H "Authorization: Bearer $ADMIN_TOKEN" \
 *     https://api.herzblatt-journal.com/admin/backup.json \
 *     -o backup-$(date +%Y-%m-%d).json
 *
 * Intended für tägliche Cold-Backups via Cron.
 */
import { Hono } from 'hono';
import { desc } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';

const app = new Hono();

app.get('/', async (c) => {
  const start = Date.now();

  const [pageviews, clicks, subscribers, registrations, readersCounter] = await Promise.all([
    db.select().from(schema.pageviews).orderBy(desc(schema.pageviews.ts)),
    db.select().from(schema.clicks).orderBy(desc(schema.clicks.ts)),
    db.select().from(schema.subscribers).orderBy(desc(schema.subscribers.createdAt)),
    db.select().from(schema.registrations).orderBy(desc(schema.registrations.createdAt)),
    db.select().from(schema.readersCounter),
  ]);

  const backup = {
    exported_at: new Date().toISOString(),
    export_duration_ms: Date.now() - start,
    schema_version: 1,
    counts: {
      pageviews: pageviews.length,
      clicks: clicks.length,
      subscribers: subscribers.length,
      registrations: registrations.length,
    },
    tables: {
      pageviews,
      clicks,
      subscribers,
      registrations,
      readers_counter: readersCounter,
    },
  };

  const dateStr = new Date().toISOString().slice(0, 10);

  return new Response(JSON.stringify(backup, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="herzblatt-backup-${dateStr}.json"`,
      'Cache-Control': 'no-store',
    },
  });
});

export default app;
