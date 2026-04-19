// Sentry MUSS ganz oben initialisiert werden (vor allen anderen Imports),
// damit Instrumentierung greift. Import-Nebeneffekt ruft initSentry() auf.
import './lib/sentry.js';
import { captureError, flushSentry } from './lib/sentry.js';

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { sql } from 'drizzle-orm';
import { db } from './db/index.js';

// Public Routes
import pageviewRoute from './routes/pageview.js';
import trackClickRoute from './routes/track-click.js';
import newsletterRoute from './routes/newsletter.js';
import registerRoute from './routes/register.js';
import readersRoute from './routes/readers.js';
import digistoreIpnRoute from './routes/digistore-ipn.js';
import unsubscribeRoute from './routes/unsubscribe.js';
import inboundEmailRoute from './routes/inbound-email.js';
import contactRoute from './routes/contact.js';
import productsPublicRoute from './routes/products.js';
import pushRoute from './routes/push.js';
import micropaymentCheckoutRoute from './routes/micropayment-checkout.js';
import micropaymentWebhookRoute from './routes/micropayment-webhook.js';
import whopWebhookRoute from './routes/whop-webhook.js';
import ebookAccessRoute from './routes/ebook-access.js';

// Runtime-Migrations
import { runStartupMigrations } from './db/migrate.js';
import { assertIpSaltConfigured } from './lib/crypto.js';
import { assertUnsubscribeSecretConfigured } from './routes/unsubscribe.js';
import { assertEbookAccessSecretConfigured } from './lib/ebook-access.js';

// Auth Routes
import authRoute from './routes/auth.js';

// Admin (session-protected)
import herzraumStatsRoute from './routes/herzraum/stats.js';
import herzraumClicksSourcesRoute from './routes/herzraum/clicks-sources.js';
import herzraumNewsletterRoute from './routes/herzraum/newsletter.js';
import herzraumReadersListRoute from './routes/herzraum/readers-list.js';
import herzraumDataRoute from './routes/herzraum/data.js';
import herzraumPasswordVerifyRoute from './routes/herzraum/password-verify.js';
import herzraumPurchasesRoute from './routes/herzraum/purchases.js';
import herzraumArticlesRoute from './routes/herzraum/articles.js';
import herzraumAuthorsRoute from './routes/herzraum/authors.js';
import herzraumRedirectsRoute from './routes/herzraum/redirects.js';
import herzraumAuditLogRoute from './routes/herzraum/audit-log.js';
import herzraumEmailTemplatesRoute from './routes/herzraum/email-templates.js';
import herzraumInboxRoute from './routes/herzraum/inbox.js';
import herzraumProductsRoute from './routes/herzraum/products.js';
import herzraumTodosRoute from './routes/herzraum/todos.js';
import herzraumPushRoute from './routes/herzraum/push.js';
import herzraumAffiliateLinksRoute from './routes/herzraum/affiliate-links.js';

// Public Short-URL-Endpoint (für /go/:slug Klicks)
import goRoute from './routes/go.js';

// Admin (bearer-token)
import adminSubscribersCsvRoute from './routes/admin/subscribers-csv.js';
import adminCronCleanupRoute from './routes/admin/cron-cleanup.js';
import adminSendgridRoute from './routes/admin/sendgrid.js';
import adminMetricsRoute from './routes/admin/metrics.js';
import adminBackupRoute from './routes/admin/backup.js';
import adminGdprRoute from './routes/admin/gdpr.js';
import adminPurchasesCsvRoute from './routes/admin/purchases-csv.js';

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
//
// /health liefert eine Status-Übersicht für externes Monitoring:
//   - ok:            grober Gesamt-Status (false wenn DB nicht erreichbar)
//   - service:       Service-Name
//   - ts:            Server-Zeit (ISO-8601)
//   - version:       Commit-SHA (via RAILWAY_GIT_COMMIT_SHA, erste 7 Zeichen)
//   - env:           NODE_ENV bzw. "production" / "test" / "development"
//   - dbOk:          DB-Round-Trip erfolgreich (SELECT 1, max 1.5s)
//   - providers:     welche Payment-Provider konfiguriert sind (ohne Secrets)
//   - sendgrid:      SendGrid-API-Key vorhanden
//   - sentry:        Sentry-DSN vorhanden
//
// Der DB-Check hat einen harten Timeout (1.5s), damit Monitoring-Systeme
// nicht blockieren. Bei Timeout oder Fehler → dbOk=false + ok=false.
app.get('/health', async (c) => {
  const version = process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) || 'dev';
  const env = process.env.NODE_ENV || 'production';

  // DB-Round-Trip mit Timeout — verhindert hängendes /health
  let dbOk = false;
  try {
    const dbCheck = db.execute(sql`SELECT 1 AS ok`);
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('db-timeout')), 1500),
    );
    await Promise.race([dbCheck, timeout]);
    dbOk = true;
  } catch (err) {
    console.error('[health] db check failed:', err);
    dbOk = false;
  }

  const providers = {
    digistore: !!process.env.DIGISTORE_IPN_PASSPHRASE,
    whop: !!process.env.WHOP_WEBHOOK_SECRET,
    micropayment:
      !!process.env.MICROPAYMENT_ACCESS_KEY && !!process.env.MICROPAYMENT_PROJECT_KEY,
  };

  const body = {
    ok: dbOk,
    service: 'herzblatt-backend',
    ts: new Date().toISOString(),
    version,
    env,
    dbOk,
    providers,
    sendgrid: !!process.env.SENDGRID_API_KEY,
    sentry: !!process.env.SENTRY_DSN,
  };

  return c.json(body, dbOk ? 200 : 503);
});

app.get('/', (c) => c.text('Herzblatt Backend API — siehe /health'));

// Public API Routes
app.route('/pageview', pageviewRoute);
app.route('/track-click', trackClickRoute);
app.route('/newsletter', newsletterRoute);
app.route('/register', registerRoute);
app.route('/readers', readersRoute);
app.route('/digistore-ipn', digistoreIpnRoute);
app.route('/unsubscribe', unsubscribeRoute);
app.route('/inbound-email', inboundEmailRoute);
app.route('/contact', contactRoute);
app.route('/products', productsPublicRoute);
app.route('/push', pushRoute);
app.route('/go', goRoute);

// Checkout + Payment-Webhooks
app.route('/api/checkout/micropayment', micropaymentCheckoutRoute);
app.route('/api/webhooks/micropayment', micropaymentWebhookRoute);
app.route('/api/webhooks/whop', whopWebhookRoute);

// Ebook-Delivery — Token-basiert, public (inkl. GET /recent-buyers Social-Proof-Counter)
app.route('/api/ebook', ebookAccessRoute);

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
app.route('/herzraum/purchases', herzraumPurchasesRoute);
app.route('/herzraum/articles', herzraumArticlesRoute);
app.route('/herzraum/authors', herzraumAuthorsRoute);
app.route('/herzraum/redirects', herzraumRedirectsRoute);
app.route('/herzraum/audit-log', herzraumAuditLogRoute);
app.route('/herzraum/email-templates', herzraumEmailTemplatesRoute);
app.route('/herzraum/inbox', herzraumInboxRoute);
app.route('/herzraum/products', herzraumProductsRoute);
app.route('/herzraum/todos', herzraumTodosRoute);
app.route('/herzraum/push', herzraumPushRoute);
app.route('/herzraum/affiliate-links', herzraumAffiliateLinksRoute);

// Admin — bearer token
app.use('/admin/*', requireAdminToken);
app.route('/admin/subscribers.csv', adminSubscribersCsvRoute);
app.route('/admin/purchases.csv', adminPurchasesCsvRoute);
app.route('/admin/cron/cleanup', adminCronCleanupRoute);
app.route('/admin/sendgrid', adminSendgridRoute);
app.route('/admin/metrics', adminMetricsRoute);
app.route('/admin/backup.json', adminBackupRoute);
app.route('/admin/gdpr', adminGdprRoute);

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

// Fail-closed Boot-Checks für Security-kritische Secrets.
// Wir werfen laut und früh, damit Railway das Deployment als "unhealthy"
// markiert statt mit halb-funktionalen Defaults zu starten.
try {
  assertIpSaltConfigured();
} catch (err) {
  console.error('[backend] FATAL:', err instanceof Error ? err.message : err);
  captureError(err, { stage: 'boot', check: 'IP_SALT' });
  void flushSentry(3000).finally(() => process.exit(1));
  throw err;
}

try {
  assertUnsubscribeSecretConfigured();
} catch (err) {
  console.error('[backend] FATAL:', err instanceof Error ? err.message : err);
  captureError(err, { stage: 'boot', check: 'UNSUBSCRIBE_SECRET' });
  void flushSentry(3000).finally(() => process.exit(1));
  throw err;
}

try {
  assertEbookAccessSecretConfigured();
} catch (err) {
  console.error('[backend] FATAL:', err instanceof Error ? err.message : err);
  captureError(err, { stage: 'boot', check: 'EBOOK_ACCESS_SECRET' });
  void flushSentry(3000).finally(() => process.exit(1));
  throw err;
}

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
