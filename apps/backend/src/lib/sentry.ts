/**
 * Sentry-Init — aktiviert sich nur wenn SENTRY_DSN gesetzt ist.
 * Ohne DSN: No-Op, kein Overhead, keine Netzwerk-Calls.
 *
 * Verwendung:
 *   import './lib/sentry.js';   // ganz oben in index.ts (VOR allem anderen)
 *   import { captureError } from './lib/sentry.js';
 */
import * as Sentry from '@sentry/node';

const DSN = process.env.SENTRY_DSN;
const ENV = process.env.SENTRY_ENV || process.env.NODE_ENV || 'production';
const RELEASE = process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) || 'dev';

let initialized = false;

export function initSentry(): void {
  if (initialized) return;
  if (!DSN) {
    console.log('[sentry] SENTRY_DSN nicht gesetzt — Sentry bleibt deaktiviert');
    return;
  }
  try {
    Sentry.init({
      dsn: DSN,
      environment: ENV,
      release: RELEASE,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.05'),
      // Keine PII automatisch erfassen
      sendDefaultPii: false,
      // Ignoriere harmlose Errors
      ignoreErrors: [
        'AbortError',
        'NetworkError',
        /^Request aborted/,
      ],
    });
    initialized = true;
    console.log(`[sentry] initialized — env=${ENV} release=${RELEASE}`);
  } catch (err) {
    console.error('[sentry] init failed:', err);
  }
}

/** Manueller Error-Capture, falls nötig. */
export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (!initialized) return;
  try {
    if (context) Sentry.setContext('extra', context);
    Sentry.captureException(err);
  } catch {
    // still fail silently — errors in error-reporting should never crash
  }
}

/** Für Hono onError-Handler: Event flushen bevor Response zurückgeht. */
export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (!initialized) return;
  try {
    await Sentry.flush(timeoutMs);
  } catch {
    /* noop */
  }
}

// Automatisch initialisieren beim Import
initSentry();
