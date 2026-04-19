/**
 * Log-Helpers — gemeinsame Utilities für konsistentes Logging
 * in Payment-Webhooks und anderen sensiblen Routes.
 *
 * Ziel: keine PII (Email, volle Order-IDs, Secrets) in Production-Logs.
 */

/**
 * Redaktiert eine Email für Log-Ausgaben.
 *
 * Beispiele:
 *   "alice@example.com"       → "alice@**"
 *   "bob.smith@sub.domain.io" → "bob.smith@**"
 *   ""                        → "(empty)"
 *   "not-an-email"            → "(invalid)"
 */
export function redactEmail(email: string | null | undefined): string {
  if (!email) return '(empty)';
  const s = String(email).trim();
  if (!s) return '(empty)';
  const at = s.indexOf('@');
  if (at <= 0 || at === s.length - 1) return '(invalid)';
  return `${s.slice(0, at)}@**`;
}

/**
 * Timing-safe String-Vergleich für Signaturen (hex/base64).
 * Schützt gegen Timing-Attacks bei HMAC-/Hash-Vergleichen.
 */
import { timingSafeEqual } from 'node:crypto';

export function safeEqualHex(a: string, b: string): boolean {
  if (!a || !b) return false;
  const aNorm = a.toLowerCase();
  const bNorm = b.toLowerCase();
  if (aNorm.length !== bNorm.length) return false;
  try {
    return timingSafeEqual(Buffer.from(aNorm, 'utf8'), Buffer.from(bNorm, 'utf8'));
  } catch {
    return false;
  }
}

/**
 * Trunciert rawPayload für DB-Speicherung (Default 10.000 Zeichen).
 * Wenn truncated → Hinweis anhängen.
 */
export function truncatePayload(payload: unknown, maxLen = 10_000): string {
  let s: string;
  try {
    s = typeof payload === 'string' ? payload : JSON.stringify(payload);
  } catch {
    s = '(unserializable)';
  }
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 20) + '...[TRUNCATED]';
}
