/**
 * Strukturierter JSON-Logger für Backend.
 *
 * Ziel:
 *   - Jeder Log-Eintrag ist maschinenlesbares JSON (Level, Timestamp, RequestID, Msg, Extra).
 *   - PII wird NIE direkt geloggt — Caller müssen redactEmail/redactIp nutzen.
 *   - In Development (NODE_ENV !== 'production') werden Logs zusätzlich
 *     human-friendly ausgegeben (plain-text), damit tsx-watch-Logs lesbar bleiben.
 *
 * Ersetzt NICHT `console.*` komplett — wir behalten bestehende Log-Calls bei und
 * benutzen diesen Logger nur an neuralgischen Stellen (Error-Handler, Startup,
 * Shutdown, Cron-Jobs). Bestehende console.log/error-Calls mit redactEmail
 * funktionieren weiterhin.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

const IS_PROD = process.env.NODE_ENV === 'production';
const MIN_LEVEL: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) || (IS_PROD ? 'info' : 'debug');

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[MIN_LEVEL];
}

/**
 * Stellt sicher, dass ein Error-Objekt serialisierbar ist.
 * Gibt `message` zurück, und nur in Dev/Test auch `stack`.
 */
function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    const base: Record<string, unknown> = {
      name: err.name,
      message: err.message,
    };
    if (!IS_PROD && err.stack) base.stack = err.stack;
    return base;
  }
  return { message: String(err) };
}

function emit(level: LogLevel, msg: string, extra?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;
  const entry: Record<string, unknown> = {
    level,
    ts: new Date().toISOString(),
    msg,
  };
  if (extra && typeof extra === 'object') {
    for (const [k, v] of Object.entries(extra)) {
      if (v instanceof Error) {
        entry[k] = serializeError(v);
      } else {
        entry[k] = v;
      }
    }
  }
  const line = JSON.stringify(entry);
  if (level === 'error' || level === 'fatal') {
    // stderr for errors
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (msg: string, extra?: Record<string, unknown>) => emit('debug', msg, extra),
  info: (msg: string, extra?: Record<string, unknown>) => emit('info', msg, extra),
  warn: (msg: string, extra?: Record<string, unknown>) => emit('warn', msg, extra),
  error: (msg: string, extra?: Record<string, unknown>) => emit('error', msg, extra),
  fatal: (msg: string, extra?: Record<string, unknown>) => emit('fatal', msg, extra),
};

/** Kurze, kollisionsarme Request-ID (nicht kryptographisch). */
export function makeRequestId(): string {
  // 12-Zeichen base36 aus random + timestamp, ausreichend eindeutig für Tracing.
  const rand = Math.floor(Math.random() * 0xffffffff).toString(36);
  const ts = Date.now().toString(36).slice(-6);
  return `${ts}-${rand}`;
}
