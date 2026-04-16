/**
 * Herzraum Auth System
 * Session-based password login with rate limiting and signed tokens.
 *
 * Token-Strategie:
 *   - Token = base64url(32 random bytes)
 *   - Server speichert Hash(token) in sessions.json mit expiry
 *   - Cookie enthält Token (httpOnly, secure, sameSite=strict)
 *
 * Warum Hash statt Raw-Token speichern: wenn sessions.json leakt (Log, Backup),
 * kann der Angreifer sich nicht einloggen.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.join(process.cwd(), 'data');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const ATTEMPTS_FILE = path.join(DATA_DIR, 'login-attempts.json');

export const COOKIE_NAME = 'hz_session';
export const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24h
export const LOGIN_RATE_WINDOW_MS = 10 * 60 * 1000; // 10 min
export const LOGIN_RATE_MAX = 5;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

interface SessionRecord {
  tokenHash: string;
  createdAt: number;
  expiresAt: number;
  ipHash: string;
}

interface LoginAttempt {
  ipHash: string;
  timestamp: number;
  success: boolean;
}

function readSessions(): SessionRecord[] {
  ensureDataDir();
  if (!fs.existsSync(SESSIONS_FILE)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeSessions(sessions: SessionRecord[]) {
  ensureDataDir();
  const tmp = SESSIONS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(sessions, null, 2), 'utf-8');
  fs.renameSync(tmp, SESSIONS_FILE);
}

function readAttempts(): LoginAttempt[] {
  ensureDataDir();
  if (!fs.existsSync(ATTEMPTS_FILE)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(ATTEMPTS_FILE, 'utf-8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeAttempts(attempts: LoginAttempt[]) {
  ensureDataDir();
  const tmp = ATTEMPTS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(attempts, null, 2), 'utf-8');
  fs.renameSync(tmp, ATTEMPTS_FILE);
}

/**
 * Hash IP mit statischem Salt (DSGVO-konform).
 * Gleicher Salt wie in newsletter.ts — wiederverwendet.
 */
function hashIp(ip: string): string {
  const salt = process.env.IP_SALT || 'herzblatt-default-salt-please-change';
  return crypto.createHash('sha256').update(ip + salt).digest('hex').slice(0, 32);
}

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

/**
 * Prüft das Herzraum-Passwort und legt bei Erfolg eine Session an.
 * Ratelimiting via IP-Hash.
 */
export function attemptLogin(password: string, clientIp: string): { ok: true; token: string } | { ok: false; reason: 'rate-limit' | 'invalid-password' | 'not-configured' } {
  const expected = process.env.HERZRAUM_PASSWORD;
  if (!expected || expected.length < 8) {
    return { ok: false, reason: 'not-configured' };
  }

  const ipHash = hashIp(clientIp);

  // Rate Limit: max LOGIN_RATE_MAX failed attempts from same IP in window
  const now = Date.now();
  const allAttempts = readAttempts();
  const recentFailed = allAttempts.filter(
    (a) => a.ipHash === ipHash && !a.success && now - a.timestamp < LOGIN_RATE_WINDOW_MS
  );
  if (recentFailed.length >= LOGIN_RATE_MAX) {
    return { ok: false, reason: 'rate-limit' };
  }

  // Password check (timing-safe)
  const ok = timingSafeEqual(password, expected);
  const attempt: LoginAttempt = { ipHash, timestamp: now, success: ok };

  // Prune old attempts (> 7 days) um Datei schlank zu halten
  const cutoff = now - 7 * 24 * 60 * 60 * 1000;
  const pruned = allAttempts.filter((a) => a.timestamp > cutoff);
  pruned.push(attempt);
  writeAttempts(pruned);

  if (!ok) {
    return { ok: false, reason: 'invalid-password' };
  }

  // Session erstellen
  const token = crypto.randomBytes(32).toString('base64url');
  const session: SessionRecord = {
    tokenHash: hashToken(token),
    createdAt: now,
    expiresAt: now + SESSION_DURATION_MS,
    ipHash,
  };

  const sessions = readSessions();
  // Gleichzeitig alte/abgelaufene entfernen
  const alive = sessions.filter((s) => s.expiresAt > now);
  alive.push(session);
  writeSessions(alive);

  return { ok: true, token };
}

/**
 * Prüft ob ein Token einer gültigen Session entspricht.
 * Gibt true zurück wenn ja.
 */
export function verifySession(token: string | null | undefined): boolean {
  if (!token || typeof token !== 'string' || token.length < 20) return false;
  const sessions = readSessions();
  const now = Date.now();

  // Abgelaufene entfernen (einmal pro Verify), nur wenn welche da sind
  const alive = sessions.filter((s) => s.expiresAt > now);
  if (alive.length !== sessions.length) {
    writeSessions(alive);
  }

  const tokenHash = hashToken(token);
  return alive.some((s) => timingSafeEqual(s.tokenHash, tokenHash));
}

/**
 * Destroyed die Session zum Token (für Logout).
 */
export function destroySession(token: string | null | undefined): void {
  if (!token) return;
  const tokenHash = hashToken(token);
  const sessions = readSessions();
  const remaining = sessions.filter((s) => !timingSafeEqual(s.tokenHash, tokenHash));
  writeSessions(remaining);
}

/**
 * Change-Password: erst checken, dann env-file updaten geht in Astro/Railway nicht —
 * daher Antwort: Dashboard zeigt einen Hinweis, wie man das ENV manuell ändert.
 * Diese Funktion prüft nur, ob das Current-Passwort stimmt.
 */
export function verifyCurrentPassword(password: string): boolean {
  const expected = process.env.HERZRAUM_PASSWORD;
  if (!expected) return false;
  return timingSafeEqual(password, expected);
}

/**
 * Extract client IP aus Request — Railway/Fastly liefert x-forwarded-for
 */
export function getClientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const real = request.headers.get('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}

/**
 * Cookie-String für Response (Set-Cookie Header).
 */
export function buildSessionCookie(token: string, maxAgeSec: number = SESSION_DURATION_MS / 1000): string {
  const attrs = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAgeSec}`,
    'Secure',
  ];
  return attrs.join('; ');
}

/**
 * Cookie-String zum Löschen.
 */
export function buildLogoutCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Secure`;
}

/**
 * Liest das Session-Token aus einem Cookie-Header.
 */
export function extractToken(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp('(?:^|; )' + COOKIE_NAME + '=([^;]+)'));
  return match ? decodeURIComponent(match[1]) : null;
}
