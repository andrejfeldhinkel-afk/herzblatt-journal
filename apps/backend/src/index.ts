// Sentry MUSS ganz oben initialisiert werden (vor allen anderen Imports),
// damit Instrumentierung greift. Import-Nebeneffekt ruft initSentry() auf.
import './lib/sentry.js';
import { captureError, flushSentry } from './lib/sentry.js';

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

// Public Routes
import pageviewRoute from './routes/pageview.js';
import trackClickRoute from './routes/track-click.js';
import newsletterRoute from './routes/newsletter.js';
import registerRoute from './routes/register.js';
import readersRoute from './routes/readers.js';
import digistoreIpnRoute from './routes/digistore-ipn.js';

// Runtime-Migrations
import { runStartupMigrations } from './db/migrate.js';

// Auth Routes
import authRoute from './routes/auth.js';

// Admin (session-protected)
import herzraumStatsRoute from './routes/herzraum/stats.js';
import herzraumClicksSourcesRoute from './routes/herzraum/clicks-sources.js';
import herzraumNewsletterRoute from './routes/herzraum/newsletter.js';
import herzraumReadersListRoute from './routes/herzraum/readers-list.js';
import herzraumDataRoute from './routes/herzraum/data.js';
import herzraumPasswordVerifyRoute from './routes/herzraum/password-verify.js';

// Admin (bearer-token)
import adminSubscribersCsvRoute from './routes/admin/subscribers-csv.js';
import adminCronCleanupRoute from './routes/admin/cron-cleanup.js';
import adminSendgridRoute from './routes/admin/sendgrid.js';
import adminMetricsRoute from './routes/admin/metrics.js';
import adminBackupRoute from './routes/admin/backup.js';

// Middleware
import { requireSession, requireAdminToken } from './lib/auth-middleware.js';

const app = new Hono();

app.use('*', cors({
  origin: (process.env.ALLOWED_ORIGINS || 'http://localhost:4321').split(',').map(s => s.trim()),
  credentials: true,
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600,
}));

// Health + Root
app.get('/health', (c) => c.json({ ok: true, service: 'herzblatt-backend', ts: new Date().toISOString() }));
app.get('/', (c) => c.text('Herzblatt Backend API — siehe /health'));

// Public API Routes
app.route('/pageview', pageviewRoute);
app.route('/track-click', trackClickRoute);
app.route('/newsletter', newsletterRoute);
app.route('/register', registerRoute);
app.route('/readers', readersRoute);
app.route('/digistore-ipn', digistoreIpnRoute);

// Auth Routes (eigene security)
app.route('/auth', authRoute);

// Herzraum — protected by cookie session
app.use('/herzraum/*', requireSession);
app.route('/herzraum/stats', herzraumStatsRoute);
app.route('/herzraum/clicks/sources', herzraumClicksSourcesRoute);
app.route('/herzraum/newsletter', herzraumNewsletterRoute);
app.route('/herzraum/readers/list', herzraumReadersListRoute);
app.route('/herzraum/data', herzraumDataRoute);
app.route('/herzraum/password/verify', herzraumPasswordVerifyRoute);

// Admin — bearer token
app.use('/admin/*', requireAdminToken);
app.route('/admin/subscribers.csv', adminSubscribersCsvRoute);
app.route('/admin/cron/cleanup', adminCronCleanupRoute);
app.route('/admin/sendgrid', adminSendgridRoute);
app.route('/admin/metrics', adminMetricsRoute);
app.route('/admin/backup.json', adminBackupRoute);

// Globaler Error-Handler → Sentry + JSON-Response
app.onError(async (err, c) => {
  console.error('[hono] unhandled error:', err);
  captureError(err, {
    path: new URL(c.req.url).pathname,
    method: c.req.method,
  });
  await flushSentry(1500);
  return c.json(
    { error: 'Internal Server Error', message: err.message || 'unknown' },
    500,
  );
});

const port = Number(process.env.PORT) || 3001;
const host = process.env.HOST || '0.0.0.0';

serve({
  fetch: app.fetch,
  port,
  hostname: host,
}, (info) => {
  console.log(`[backend] listening on http://${info.address}:${info.port}`);
});

// Migrations parallel zum Server-Start ausführen — NICHT blockieren.
// Falls DB noch nicht bereit ist, loggt migrate.ts den Error intern.
void runStartupMigrations();

// Graceful shutdown: Sentry-Events flushen bevor Prozess endet
async function gracefulShutdown(signal: string) {
  console.log(`[backend] ${signal} received — flushing Sentry & exiting`);
  await flushSentry(3000);
  process.exit(0);
}
process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
