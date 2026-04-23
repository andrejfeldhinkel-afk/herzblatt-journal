// Sentry MUSS ganz oben initialisiert werden (vor allen anderen Imports),
// damit Instrumentierung greift. Import-Nebeneffekt ruft initSentry() auf.
import './lib/sentry.js';
import { captureError, flushSentry } from './lib/sentry.js';

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { sql } from 'drizzle-orm';
import { db, closeDbPool } from './db/index.js';
import { logger, makeRequestId } from './lib/logger.js';

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
import { startNewsletterScheduler, stopNewsletterScheduler } from './lib/newsletter-scheduler.js';
import { assertIpSaltConfigured } from './lib/crypto.js';
import { assertUnsubscribeSecretConfigured } from './routes/unsubscribe.js';
import { assertEbookAccessSecretConfigured } from './lib/ebook-access.js';

// Auth Routes
import authRoute from './routes/auth.js';

// Admin (session-protected)
import herzraumStatsRoute from './routes/herzraum/stats.js';
import herzraumKpiSummaryRoute from './routes/herzraum/kpi-summary.js';
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
import herzraumAffiliateCodesRoute from './routes/herzraum/affiliate-codes.js';
import herzraumNewsletterBroadcastRoute from './routes/herzraum/newsletter-broadcast.js';

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
import adminEbookDripRoute from './routes/admin/ebook-drip.js';

// Middleware
import { requireSession, requireAdminToken } from './lib/auth-middleware.js';
import { requireCsrfToken, assertCsrfSecret } from './lib/csrf.js';

const app = new Hono();
const IS_PROD = process.env.NODE_ENV === 'production';

// Request-ID-Middleware — MUSS als erstes hängen, damit alle nachfolgenden
// Handler/Error-Handler die ID haben. Wir nehmen einen eingehenden Header
// (`x-request-id`) wenn vorhanden (Railway/Cloudflare setzen das oft),
// sonst generieren wir einen. Der ausgehende Response trägt die ID — nützlich
// beim Support: "Bitte schick uns die x-request-id aus den DevTools".
app.use('*', async (c, next) => {
  const incoming = c.req.header('x-request-id') || c.req.header('cf-ray');
  const rid = (incoming && incoming.length <= 80) ? incoming : makeRequestId();
  c.set('requestId' as never, rid);
  c.header('x-request-id', rid);
  await next();
});

app.use('*', cors({
  origin: (process.env.ALLOWED_ORIGINS || 'http://localhost:4321').split(',').map(s => s.trim()),
  credentials: true,
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'x-csrf-token'],
  maxAge: 600,
}));

// Security-Headers auf allen Backend-Responses. Defense-in-Depth —
// das Astro-Frontend setzt bereits die HTML-spezifischen Header (CSP,
// X-Frame-Options etc.), aber JSON-Responses vom Backend müssen auch
// hardened sein, z.B. wenn Links direkt auf api.herzblatt-journal.com
// klickbar sind oder ein Angreifer versucht das Backend als XSS-Sink
// zu missbrauchen (Content-Type-Sniffing, Frame-Embed).
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  c.header(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), ' +
    'magnetometer=(), gyroscope=(), accelerometer=(), interest-cohort=(), ' +
    'browsing-topics=()',
  );
  // API-Responses dürfen NICHT geframed werden und brauchen keinerlei
  // Script-Execution-Kontext → restriktive CSP.
  c.header(
    'Content-Security-Policy',
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none';",
  );
  c.header('Cross-Origin-Opener-Policy', 'same-origin');
  c.header('Cross-Origin-Resource-Policy', 'same-site');
  c.header('X-Permitted-Cross-Domain-Policies', 'none');
});

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
    logger.warn('health_db_check_failed', { err });
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
// CSRF-Schutz auf alle mutierenden Requests (POST/PATCH/DELETE/PUT).
// GET/HEAD/OPTIONS passieren ohne Check durch und liefern das frische
// CSRF-Cookie via requireSession.
app.use('/herzraum/*', requireCsrfToken);
// kpi-summary MUSS vor stats registriert werden (spezifischer Pfad zuerst).
app.route('/herzraum/stats/kpi-summary', herzraumKpiSummaryRoute);
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
app.route('/herzraum/affiliate-codes', herzraumAffiliateCodesRoute);
app.route('/herzraum/newsletter-broadcast', herzraumNewsletterBroadcastRoute);

// Admin — bearer token
app.use('/admin/*', requireAdminToken);
app.route('/admin/subscribers.csv', adminSubscribersCsvRoute);
app.route('/admin/purchases.csv', adminPurchasesCsvRoute);
app.route('/admin/cron/cleanup', adminCronCleanupRoute);
app.route('/admin/sendgrid', adminSendgridRoute);
app.route('/admin/metrics', adminMetricsRoute);
app.route('/admin/backup.json', adminBackupRoute);
app.route('/admin/gdpr', adminGdprRoute);
app.route('/admin/cron/ebook-drip', adminEbookDripRoute);

// Globaler Error-Handler → Sentry + JSON-Response
//
// WICHTIG: In Production wird NIE der Error-Message an den Client geschickt
// (könnte PII aus DB-Errors, Query-Strings, File-Paths leaken). Wir loggen
// die full error mit requestId in strukturiertem JSON + senden dem Client
// nur die generische Meldung + requestId (damit Support-Anfragen korreliert
// werden können). In Development geben wir `message` durch für DX.
app.onError(async (err, c) => {
  const requestId = (c.get('requestId' as never) as string) || 'unknown';
  const path = new URL(c.req.url).pathname;
  const method = c.req.method;

  logger.error('unhandled_error', {
    requestId,
    path,
    method,
    err,
  });
  captureError(err, { path, method, requestId });
  await flushSentry(1500);

  const body: Record<string, unknown> = {
    error: 'Internal Server Error',
    requestId,
  };
  if (!IS_PROD) {
    // Only leak message in dev/test — never in prod.
    body.message = err instanceof Error ? err.message : String(err);
  }
  return c.json(body, 500);
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

try {
  assertCsrfSecret();
} catch (err) {
  console.error('[backend] FATAL:', err instanceof Error ? err.message : err);
  captureError(err, { stage: 'boot', check: 'CSRF_SECRET' });
  void flushSentry(3000).finally(() => process.exit(1));
  throw err;
}

const port = Number(process.env.PORT) || 3001;
const host = process.env.HOST || '0.0.0.0';

const server = serve({
  fetch: app.fetch,
  port,
  hostname: host,
}, (info) => {
  logger.info('backend_listening', { address: info.address, port: info.port });
});

// Migrations parallel zum Server-Start ausführen — NICHT blockieren.
// Falls DB noch nicht bereit ist, loggt migrate.ts den Error intern.
// Nach erfolgreicher Migration startet der Newsletter-Scheduler —
// er braucht die scheduled_for Column, also erst NACH der Migration.
void runStartupMigrations().then(() => {
  startNewsletterScheduler();
}).catch((err) => {
  console.error('[backend] migrations failed — scheduler NOT started:', err);
});

// Graceful shutdown:
//   1. HTTP-Server schließen — keine neuen Connections annehmen, in-flight
//      Requests dürfen fertig werden.
//   2. Kurz warten (drain-Grace) damit Handler-Promises fertig werden.
//   3. DB-Pool mit Timeout schließen.
//   4. Sentry-Events flushen.
//   5. process.exit(0).
//
// Gesamt-Budget: ~12s (Railway gibt 30s nach SIGTERM bevor SIGKILL folgt,
// also bleibt üppig Puffer). Wenn Schritt 1 blockiert, zieht der Hard-Kill
// nach 15s (force-exit-Timer).
let isShuttingDown = false;
async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info('shutdown_start', { signal });

  // Newsletter-Scheduler stoppen (clearInterval). Läuft sonst weiter bis
  // process.exit und könnte während des Shutdown einen Send starten.
  try { stopNewsletterScheduler(); } catch { /* noop */ }

  // Hard-exit Timer — falls irgendeine Ressource nicht freigibt, killen wir
  // den Prozess nach 15s trotzdem. Railway sendet SIGKILL nach 30s.
  const forceExit = setTimeout(() => {
    logger.error('shutdown_force_exit', { signal });
    process.exit(1);
  }, 15_000);
  forceExit.unref();

  // 1) HTTP-Server schließen — kein accept() mehr, aber laufende Requests
  //    finalisieren. serve() aus @hono/node-server gibt ein Server-Objekt
  //    zurück mit .close() — typed as http.Server.
  try {
    await new Promise<void>((resolve) => {
      try {
        (server as { close?: (cb?: (err?: Error | null) => void) => void }).close?.((err) => {
          if (err) logger.warn('server_close_error', { err });
          resolve();
        });
        // Fallback: wenn close nicht existiert, sofort weiter.
        if (!(server as { close?: unknown }).close) resolve();
      } catch (err) {
        logger.warn('server_close_throw', { err });
        resolve();
      }
    });
  } catch (err) {
    logger.warn('server_close_failed', { err });
  }

  // 2) Kurzer Drain-Timeout, damit async Handler (z.B. fire-and-forget
  //    SendGrid-Posts) noch ihre DB-Writes abschließen können.
  await new Promise((r) => setTimeout(r, 500));

  // 3) DB-Pool schließen
  await closeDbPool(5);

  // 4) Sentry flushen
  await flushSentry(3000);

  clearTimeout(forceExit);
  logger.info('shutdown_complete', { signal });
  process.exit(0);
}

process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => void gracefulShutdown('SIGINT'));

// Letzter Safety-Net: unhandled rejections + uncaught exceptions → Sentry
// + strukturiertes Log. Wir beenden den Prozess NICHT automatisch (Node v20
// würde das bei unhandledRejection default tun — hier override via
// process.on), weil Railway den Container sonst neustartet und legitime
// Traffic-Spitzen unterbricht.
process.on('unhandledRejection', (reason) => {
  logger.error('unhandled_rejection', { err: reason });
  captureError(reason, { source: 'unhandledRejection' });
});
process.on('uncaughtException', (err) => {
  logger.fatal('uncaught_exception', { err });
  captureError(err, { source: 'uncaughtException' });
  // Diese Sorte Fehler ist wirklich fatal → graceful shutdown triggern
  void gracefulShutdown('uncaughtException');
});
