/**
 * CSRF-Protection — Double-Submit-Cookie + HMAC-Signatur.
 *
 * Pattern:
 *   1. Auth-Middleware (requireSession) setzt bei jedem authentifizierten
 *      Request das Cookie `hz_csrf=<token>` (nicht HttpOnly, damit JS
 *      lesen kann).
 *   2. Token = random-bytes(32) + "." + HMAC-SHA256(random, CSRF_SECRET),
 *      beides base64url.
 *   3. Frontend liest das Cookie + sendet den Wert bei POST/PATCH/DELETE
 *      im Header `x-csrf-token`.
 *   4. `requireCsrfToken` vergleicht Header vs. Cookie *und* verifiziert
 *      die HMAC-Signatur — ein Angreifer ohne CSRF_SECRET kann kein Token
 *      fälschen, selbst wenn er die Session-Cookie kennt (der reine
 *      double-submit ohne HMAC wäre unsauber, weil lokal gesetzte Cookies
 *      auf Subdomains genügen würden).
 *
 * GET/HEAD/OPTIONS bleiben frei — Mutationen (POST, PUT, PATCH, DELETE)
 * müssen geprüft werden.
 *
 * ENV:
 *   CSRF_SECRET  — 32+ chars, random. Fallback auf IP_SALT (boot-check
 *                  dort garantiert ≥32 zufällige Bytes) damit eine
 *                  Deployment-Migration nicht bricht.
 */
import crypto from 'node:crypto';
import type { MiddlewareHandler } from 'hono';

export const CSRF_COOKIE = 'hz_csrf';
export const CSRF_HEADER = 'x-csrf-token';
const CSRF_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // an Session-Lifetime angelehnt

// Wird lazily beim ersten Aufruf resolved + dann gecached — damit der
// Resolve-Check auch in Tests greift, die Module importieren ohne zu booten.
let cachedSecret: string | null = null;

function getSecret(): string {
  if (cachedSecret) return cachedSecret;
  const fromEnv = process.env.CSRF_SECRET;
  if (fromEnv && fromEnv.length >= 32) {
    cachedSecret = fromEnv;
    return cachedSecret;
  }
  // Fallback auf IP_SALT — wird beim Boot bereits auf ≥32 Bytes geprüft
  const fallback = process.env.IP_SALT;
  if (fallback && fallback.length >= 32) {
    cachedSecret = fallback;
    return cachedSecret;
  }
  // In Production HART crashen statt auf hartcodiertes Dev-Secret zurückzufallen.
  // Sonst ist die ganze CSRF-Schicht taub, wenn jemand vergisst, CSRF_SECRET+IP_SALT zu setzen.
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '[csrf] CSRF_SECRET (oder IP_SALT als Fallback) muss in Produktion gesetzt sein (min. 32 Zeichen).',
    );
  }
  // Dev-Fallback: stable ephemeral-secret pro Prozess.
  cachedSecret = 'dev-csrf-secret-not-for-production-use-at-all-dont';
  // eslint-disable-next-line no-console
  console.warn('[csrf] WARN: CSRF_SECRET nicht gesetzt — nutze Dev-Fallback. Nur in Dev/Test erlaubt.');
  return cachedSecret;
}

/**
 * Boot-Assert: Beim Server-Start aufrufen, damit ein fehlendes Secret in
 * Produktion SOFORT den Prozess crasht und nicht erst beim ersten Login.
 */
export function assertCsrfSecret(): void {
  // triggert den Resolve-Pfad + evtl. den throw
  getSecret();
}

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

function timingSafeStrEq(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  } catch {
    return false;
  }
}

/**
 * Erzeugt ein CSRF-Token der Form `<random>.<hmac>`.
 * Der HMAC-Teil garantiert dass nur unser Backend Tokens signieren kann.
 */
export function generateCsrfToken(): string {
  const random = b64url(crypto.randomBytes(32));
  const sig = b64url(
    crypto.createHmac('sha256', getSecret()).update(random).digest(),
  );
  return `${random}.${sig}`;
}

/**
 * Prüft ob Token wohlgeformt + HMAC korrekt ist.
 */
function verifyTokenShape(token: string | null | undefined): boolean {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [random, sig] = parts;
  if (!random || !sig) return false;
  const expected = b64url(
    crypto.createHmac('sha256', getSecret()).update(random).digest(),
  );
  return timingSafeStrEq(sig, expected);
}

function extractCsrfCookie(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp('(?:^|; )' + CSRF_COOKIE + '=([^;]+)'));
  return match ? decodeURIComponent(match[1]) : null;
}

function cookieAttrs(): string {
  const secure = process.env.COOKIE_SECURE === 'false' ? '' : '; Secure';
  const domain = process.env.COOKIE_DOMAIN ? `; Domain=${process.env.COOKIE_DOMAIN}` : '';
  const maxAge = Math.floor(CSRF_TOKEN_TTL_MS / 1000);
  // NICHT HttpOnly — Frontend-JS muss den Wert lesen können (double-submit).
  // SameSite=Lax ist ausreichend für reine Mutation-Protection.
  return `Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}${domain}`;
}

export function buildCsrfCookie(token: string): string {
  return `${CSRF_COOKIE}=${token}; ${cookieAttrs()}`;
}

/**
 * Stellt sicher, dass nach Auth ein gültiges CSRF-Cookie existiert. Wird
 * von `requireSession` automatisch mitgesetzt (siehe auth-middleware.ts).
 *
 * Pro Request höchstens einmal — wenn das Cookie bereits gültig ist,
 * unverändert lassen (damit ein Refresh nicht jeden request rotiert).
 */
export function ensureCsrfCookie(c: {
  req: { header: (name: string) => string | undefined };
  header: (name: string, value: string, options?: { append: boolean }) => void;
}): void {
  const existing = extractCsrfCookie(c.req.header('cookie'));
  if (existing && verifyTokenShape(existing)) return;
  const token = generateCsrfToken();
  c.header('Set-Cookie', buildCsrfCookie(token), { append: true });
}

/**
 * Interne Helper für Tests / manuelle Checks.
 */
export function verifyCsrfToken(opts: {
  cookieHeader: string | null | undefined;
  headerToken: string | null | undefined;
}): boolean {
  const cookieToken = extractCsrfCookie(opts.cookieHeader);
  if (!cookieToken) return false;
  if (!verifyTokenShape(cookieToken)) return false;
  if (!opts.headerToken) return false;
  // Double-Submit: Header muss dem Cookie entsprechen (timing-safe).
  return timingSafeStrEq(cookieToken, opts.headerToken);
}

/**
 * Hono-Middleware für alle mutierenden Methoden.
 * GET/HEAD/OPTIONS passieren ohne Check.
 */
export const requireCsrfToken: MiddlewareHandler = async (c, next) => {
  const method = c.req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    await next();
    return;
  }
  const ok = verifyCsrfToken({
    cookieHeader: c.req.header('cookie'),
    headerToken: c.req.header(CSRF_HEADER),
  });
  if (!ok) {
    return c.json({ error: 'CSRF token invalid or missing' }, 403);
  }
  await next();
};
