/**
 * Sentry für Frontend (Astro-SSR, Node-Adapter).
 * Aktiviert sich nur wenn SENTRY_DSN_FRONTEND (oder SENTRY_DSN) gesetzt ist.
 *
 * Ohne DSN: No-Op. Nie Crashes wegen Sentry selbst.
 *
 * Verwendung:
 *   import { captureError } from '../lib/sentry.js';
 *   try { ... } catch (err) { captureError(err); }
 */
import * as Sentry from '@sentry/node';

let initialized = false;

function getDsn(): string | undefined {
  return (
    (typeof process !== 'undefined' && (process.env?.SENTRY_DSN_FRONTEND || process.env?.SENTRY_DSN)) ||
    (typeof import.meta !== 'undefined' && ((import.meta as any).env?.SENTRY_DSN_FRONTEND || (import.meta as any).env?.SENTRY_DSN)) ||
    undefined
  );
}

export function initSentry(): void {
  if (initialized) return;
  const dsn = getDsn();
  if (!dsn) {
    // Silent no-op — kein Log in Prod, um Noise zu vermeiden
    return;
  }
  const env =
    (typeof process !== 'undefined' && process.env?.SENTRY_ENV) ||
    (typeof process !== 'undefined' && process.env?.NODE_ENV) ||
    'production';
  const release =
    (typeof process !== 'undefined' && process.env?.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7)) ||
    'dev';

  try {
    Sentry.init({
      dsn,
      environment: env,
      release,
      tracesSampleRate: 0.02,
      sendDefaultPii: false,
      ignoreErrors: ['AbortError', 'NetworkError'],
    });
    initialized = true;
    console.log(`[sentry-frontend] initialized — env=${env} release=${release}`);
  } catch (err) {
    console.error('[sentry-frontend] init failed:', err);
  }
}

export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (!initialized) return;
  try {
    if (context) Sentry.setContext('extra', context);
    Sentry.captureException(err);
  } catch {
    /* noop */
  }
}

export async function flushSentry(timeoutMs = 1500): Promise<void> {
  if (!initialized) return;
  try {
    await Sentry.flush(timeoutMs);
  } catch {
    /* noop */
  }
}

// Automatisch initialisieren beim Import
initSentry();
