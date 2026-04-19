/**
 * E-Book-Zugang: Token-Generierung + Verifikation.
 *
 * Sicherheits-Modell:
 *   Token = HMAC-SHA256(email.lowercased, EBOOK_ACCESS_SECRET).hex
 *   Kein Ablaufdatum — Lifetime-Access ist Teil des Produkts.
 *
 *   Für bequemes Weitersurfen wird nach Token-Verifikation ein Session-Cookie
 *   gesetzt (24h), sodass der User die Token-URL nicht im Tab offenhalten muss.
 *
 * Fail-closed: Wenn `EBOOK_ACCESS_SECRET` fehlt oder kürzer als 32 Zeichen ist,
 * werden keine Tokens ausgestellt oder verifiziert. Das Backend darf ohne
 * gesetzten Secret nicht hochkommen.
 */
import { createHmac } from 'node:crypto';
import { safeEqualHex } from './log-helpers.js';

const MIN_SECRET_LENGTH = 32;

export function getEbookAccessSecret(): string {
  const secret = process.env.EBOOK_ACCESS_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `EBOOK_ACCESS_SECRET env var missing or too short (min ${MIN_SECRET_LENGTH} chars) — refusing to issue/verify ebook tokens`,
    );
  }
  return secret;
}

/**
 * Boot-time Check: wird von index.ts vor `serve()` aufgerufen. Fail-closed.
 * Wirft wenn Secret nicht gesetzt oder zu kurz.
 */
export function assertEbookAccessSecretConfigured(): void {
  const secret = process.env.EBOOK_ACCESS_SECRET;
  if (!secret) {
    throw new Error(
      'EBOOK_ACCESS_SECRET not set — ebook token routes refuse to run. Set it in Railway backend envs (min 32 chars).',
    );
  }
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `EBOOK_ACCESS_SECRET too short (got ${secret.length}, need >=${MIN_SECRET_LENGTH})`,
    );
  }
}

/**
 * Normalisiert eine Email: lowercased + trimmed. HMAC wird darüber berechnet.
 */
export function normalizeEmail(email: string): string {
  return String(email || '').toLowerCase().trim();
}

/**
 * Erzeugt den Access-Token für eine Email.
 * Stabil: gleicher Input → gleicher Output (kein Zufall, kein Zeitstempel).
 */
export function buildEbookToken(email: string): string {
  const secret = getEbookAccessSecret();
  const normalized = normalizeEmail(email);
  return createHmac('sha256', secret).update(normalized, 'utf8').digest('hex');
}

/**
 * Verifiziert einen Token gegen eine Email. Timing-safe.
 */
export function verifyEbookToken(email: string, token: string): boolean {
  if (!email || !token) return false;
  try {
    const expected = buildEbookToken(email);
    return safeEqualHex(token, expected);
  } catch {
    return false;
  }
}

/**
 * Baut die vollständige Zugriffs-URL für die Lese-Page.
 * baseUrl sollte ohne trailing-Slash kommen (z.B. "https://herzblatt-journal.com").
 */
export function buildEbookAccessUrl(email: string, baseUrl?: string): string {
  const root = (baseUrl ||
    process.env.PUBLIC_BASE_URL ||
    process.env.APP_URL ||
    'https://herzblatt-journal.com').replace(/\/$/, '');
  const token = buildEbookToken(email);
  const normalized = normalizeEmail(email);
  return `${root}/ebook/lesen?t=${token}&e=${encodeURIComponent(normalized)}`;
}
