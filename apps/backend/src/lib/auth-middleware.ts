import type { MiddlewareHandler } from 'hono';
import crypto from 'node:crypto';
import { extractTokenFromCookie, verifySession } from './session.js';

/**
 * Hono-Middleware: Prüft Cookie-Session. Bei ungültig → 401 JSON.
 * Usage: app.use('/herzraum/*', requireSession);
 */
export const requireSession: MiddlewareHandler = async (c, next) => {
  const token = extractTokenFromCookie(c.req.header('cookie'));
  const ok = await verifySession(token);
  if (!ok) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
};

function timingSafeStrEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'utf-8'), Buffer.from(b, 'utf-8'));
  } catch {
    return false;
  }
}

/**
 * Bearer-Token-Auth: Vergleicht Authorization: Bearer <token> gegen ADMIN_TOKEN env.
 * Für scripts/pull-subscribers.sh und ähnliche.
 */
export const requireAdminToken: MiddlewareHandler = async (c, next) => {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected || expected.length < 20) {
    return c.json({ error: 'Admin endpoint not configured' }, 503);
  }
  const header = c.req.header('authorization') || '';
  const provided = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!provided || !timingSafeStrEqual(provided, expected)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
};
