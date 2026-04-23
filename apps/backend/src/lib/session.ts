import crypto from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { hashIp } from './crypto.js';

export const COOKIE_NAME = 'hz_session';
export const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;
export const LOGIN_RATE_WINDOW_MS = 10 * 60 * 1000;
export const LOGIN_RATE_MAX = 5;

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'utf-8'), Buffer.from(b, 'utf-8'));
  } catch {
    return false;
  }
}

export type LoginResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'rate-limit' | 'invalid-password' | 'not-configured' };

/**
 * Prüft Passwort + legt bei Erfolg Session in DB an.
 * Rate-Limit: max 5 fehlgeschlagene Versuche / 10 min pro IP-Hash.
 */
export async function attemptLogin(password: string, clientIp: string): Promise<LoginResult> {
  const expected = process.env.HERZRAUM_PASSWORD;
  if (!expected || expected.length < 8) {
    return { ok: false, reason: 'not-configured' };
  }
  const ipH = hashIp(clientIp);
  const now = new Date();
  const windowStart = new Date(now.getTime() - LOGIN_RATE_WINDOW_MS);

  const recent = await db
    .select({ id: schema.loginAttempts.id })
    .from(schema.loginAttempts)
    .where(and(
      eq(schema.loginAttempts.ipHash, ipH),
      eq(schema.loginAttempts.success, false),
      gt(schema.loginAttempts.ts, windowStart),
    ));
  if (recent.length >= LOGIN_RATE_MAX) {
    return { ok: false, reason: 'rate-limit' };
  }

  const pwOk = timingSafeEqual(password, expected);
  await db.insert(schema.loginAttempts).values({
    ipHash: ipH,
    success: pwOk,
  });

  if (!pwOk) return { ok: false, reason: 'invalid-password' };

  const token = crypto.randomBytes(32).toString('base64url');
  await db.insert(schema.sessions).values({
    tokenHash: hashToken(token),
    expiresAt: new Date(now.getTime() + SESSION_DURATION_MS),
    ipHash: ipH,
  });

  return { ok: true, token };
}

/**
 * Prüft ob Token einer gültigen, nicht-abgelaufenen Session entspricht.
 * Cleanup abgelaufener Sessions nebenbei.
 */
export async function verifySession(token: string | null | undefined): Promise<boolean> {
  if (!token || typeof token !== 'string' || token.length < 20) return false;

  // Vorher: `DELETE FROM sessions WHERE expires_at < NOW()` bei JEDEM
  // Request — ein Full-Table-Scan pro Verify, auch wenn nichts abgelaufen
  // ist. Auf Admin-Pages mit ~10 XHRs/min == 10 DELETE/min.
  // Cleanup ist jetzt in lib/session-cleanup.ts als periodischer Cron
  // (alle 10 Min) verlagert. Verify macht nur noch einen indexed SELECT.
  const row = await db
    .select({ id: schema.sessions.id })
    .from(schema.sessions)
    .where(and(
      eq(schema.sessions.tokenHash, hashToken(token)),
      gt(schema.sessions.expiresAt, new Date()),
    ))
    .limit(1);

  return row.length > 0;
}

export async function destroySession(token: string | null | undefined): Promise<void> {
  if (!token) return;
  await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, hashToken(token)));
}

export function verifyCurrentPassword(password: string): boolean {
  const expected = process.env.HERZRAUM_PASSWORD;
  if (!expected) return false;
  return timingSafeEqual(password, expected);
}

export function extractTokenFromCookie(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp('(?:^|; )' + COOKIE_NAME + '=([^;]+)'));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Cookie-Domain nur in production setzen — lokal (localhost) würde eine explizite
 * Domain den Cookie aussperren. Steuerung via COOKIE_DOMAIN env var.
 */
function cookieDomainPart(): string {
  const domain = process.env.COOKIE_DOMAIN;
  return domain ? `; Domain=${domain}` : '';
}

/**
 * Secure-Flag nur über HTTPS gültig. Lokal via COOKIE_SECURE=false deaktivierbar.
 */
function cookieSecurePart(): string {
  return process.env.COOKIE_SECURE === 'false' ? '' : '; Secure';
}

export function buildSessionCookie(token: string, maxAgeSec: number = SESSION_DURATION_MS / 1000): string {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${cookieSecurePart()}${cookieDomainPart()}`;
}

export function buildLogoutCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${cookieSecurePart()}${cookieDomainPart()}`;
}
