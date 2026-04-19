import { Hono } from 'hono';
import { z } from 'zod';
import {
  attemptLogin,
  buildLogoutCookie,
  buildSessionCookie,
  destroySession,
  extractTokenFromCookie,
  verifySession,
} from '../lib/session.js';
import { getClientIp } from '../lib/crypto.js';
import { buildCsrfCookie, generateCsrfToken } from '../lib/csrf.js';

const app = new Hono();

const loginSchema = z.object({
  password: z.string().min(1).max(256),
});

app.post('/login', async (c) => {
  const ct = c.req.header('content-type') || '';
  if (!ct.includes('application/json')) {
    return c.json({ ok: false, message: 'Invalid content type.' }, 400);
  }

  let body: unknown;
  try { body = await c.req.json(); }
  catch { return c.json({ ok: false, message: 'Ungültige Eingabe.' }, 400); }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, message: 'Ungültige Eingabe.' }, 400);
  }

  const ip = getClientIp(c.req.raw, c.req.raw.headers);
  const result = await attemptLogin(parsed.data.password, ip);

  if (!result.ok) {
    if (result.reason === 'rate-limit') {
      return c.json({ ok: false, message: 'Zu viele Versuche. Bitte in einigen Minuten erneut.' }, 429);
    }
    if (result.reason === 'not-configured') {
      return c.json({ ok: false, message: 'Herzraum ist nicht konfiguriert.' }, 503);
    }
    return c.json({ ok: false, message: 'Anmeldung fehlgeschlagen.' }, 401);
  }

  c.header('Set-Cookie', buildSessionCookie(result.token), { append: true });
  // CSRF-Token direkt beim Login setzen, damit das Frontend nicht auf den
  // ersten /herzraum-GET warten muss bevor es mutieren darf.
  c.header('Set-Cookie', buildCsrfCookie(generateCsrfToken()), { append: true });
  return c.json({ ok: true, redirect: '/herzraum' });
});

// POST /auth/logout — API-style (JSON)
app.post('/logout', async (c) => {
  const token = extractTokenFromCookie(c.req.header('cookie'));
  await destroySession(token);
  c.header('Set-Cookie', buildLogoutCookie(), { append: true });
  c.header('Set-Cookie', 'hz_csrf=; Path=/; Max-Age=0; SameSite=Lax', { append: true });
  return c.json({ ok: true });
});

// GET /auth/logout — Link-style (Redirect)
app.get('/logout', async (c) => {
  const token = extractTokenFromCookie(c.req.header('cookie'));
  await destroySession(token);
  c.header('Set-Cookie', buildLogoutCookie(), { append: true });
  c.header('Set-Cookie', 'hz_csrf=; Path=/; Max-Age=0; SameSite=Lax', { append: true });
  return c.redirect('https://herzblatt-journal.com/herzraum/login', 302);
});

// GET /auth/verify — für Astro-Middleware, gibt 200 bei gültiger Session
app.get('/verify', async (c) => {
  const token = extractTokenFromCookie(c.req.header('cookie'));
  const ok = await verifySession(token);
  return c.json({ ok }, ok ? 200 : 401);
});

export default app;
