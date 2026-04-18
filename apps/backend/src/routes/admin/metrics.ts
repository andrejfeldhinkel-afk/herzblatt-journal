/**
 * GET /admin/metrics
 *
 * Observability-Endpoint: zeigt Health + DB-Stats in einem Call.
 * Gut für Uptime-Monitoring (UptimeRobot/Better Uptime) oder einfach Debug.
 *
 * Bearer-ADMIN_TOKEN protected. Unter /admin/* gemountet.
 *
 * Response:
 *   {
 *     ok: true,
 *     uptime_s: 123456,
 *     db: { ok, latency_ms, error? },
 *     counts: { pageviews, clicks, subscribers, registrations, sessions, active_sessions },
 *     pageviews_24h, clicks_24h, subscribers_24h,
 *     memory_mb, node_version, env_keys_set: [...],
 *     ts
 *   }
 */
import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { db } from '../../db/index.js';

const app = new Hono();

app.get('/', async (c) => {
  const start = Date.now();
  const metrics: Record<string, unknown> = {
    ts: new Date().toISOString(),
    uptime_s: Math.floor(process.uptime()),
    node_version: process.version,
    memory_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
  };

  // DB-Health + counts in einem Call
  const dbStart = Date.now();
  try {
    const result = await db.execute(sql`
      SELECT
        (SELECT COUNT(*)::int FROM pageviews) AS pageviews,
        (SELECT COUNT(*)::int FROM clicks) AS clicks,
        (SELECT COUNT(*)::int FROM subscribers) AS subscribers,
        (SELECT COUNT(*)::int FROM registrations) AS registrations,
        (SELECT COUNT(*)::int FROM sessions) AS sessions,
        (SELECT COUNT(*)::int FROM sessions WHERE expires_at > NOW()) AS active_sessions,
        (SELECT COUNT(*)::int FROM login_attempts) AS login_attempts,
        (SELECT COUNT(*)::int FROM pageviews WHERE ts > NOW() - INTERVAL '24 hours') AS pageviews_24h,
        (SELECT COUNT(*)::int FROM clicks WHERE ts > NOW() - INTERVAL '24 hours') AS clicks_24h,
        (SELECT COUNT(*)::int FROM subscribers WHERE created_at > NOW() - INTERVAL '24 hours') AS subscribers_24h,
        (SELECT COUNT(*)::int FROM pageviews WHERE ts > NOW() - INTERVAL '7 days') AS pageviews_7d,
        (SELECT COUNT(*)::int FROM clicks WHERE ts > NOW() - INTERVAL '7 days') AS clicks_7d,
        (SELECT COUNT(*)::int FROM subscribers WHERE created_at > NOW() - INTERVAL '7 days') AS subscribers_7d,
        (SELECT count FROM readers_counter WHERE id = 1) AS readers_counter
    `);

    const row = (result as any)[0] || {};
    metrics.db = {
      ok: true,
      latency_ms: Date.now() - dbStart,
    };
    metrics.counts = {
      pageviews: Number(row.pageviews) || 0,
      clicks: Number(row.clicks) || 0,
      subscribers: Number(row.subscribers) || 0,
      registrations: Number(row.registrations) || 0,
      sessions: Number(row.sessions) || 0,
      active_sessions: Number(row.active_sessions) || 0,
      login_attempts: Number(row.login_attempts) || 0,
      readers_counter: Number(row.readers_counter) || 0,
    };
    metrics.pageviews_24h = Number(row.pageviews_24h) || 0;
    metrics.clicks_24h = Number(row.clicks_24h) || 0;
    metrics.subscribers_24h = Number(row.subscribers_24h) || 0;
    metrics.pageviews_7d = Number(row.pageviews_7d) || 0;
    metrics.clicks_7d = Number(row.clicks_7d) || 0;
    metrics.subscribers_7d = Number(row.subscribers_7d) || 0;
  } catch (err) {
    metrics.db = {
      ok: false,
      latency_ms: Date.now() - dbStart,
      error: String(err),
    };
  }

  // Welche kritischen Env-Vars sind gesetzt (ohne Werte zu leaken)
  metrics.env_keys_set = [
    'DATABASE_URL',
    'HERZRAUM_PASSWORD',
    'IP_SALT',
    'ADMIN_TOKEN',
    'COOKIE_DOMAIN',
    'SENTRY_DSN',
    'SENDGRID_API_KEY',
    'SENDGRID_LIST_ID',
    'SENDGRID_FROM_EMAIL',
    'SENDGRID_WELCOME_TEMPLATE_ID',
    'ALLOWED_ORIGINS',
  ]
    .filter((k) => !!process.env[k])
    .map((k) => k); // nur die Namen, NICHT Values

  metrics.response_ms = Date.now() - start;
  metrics.ok = (metrics.db as any)?.ok === true;

  return c.json(metrics, metrics.ok ? 200 : 503);
});

export default app;
