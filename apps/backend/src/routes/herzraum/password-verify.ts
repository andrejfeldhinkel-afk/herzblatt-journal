import { Hono } from 'hono';
import { z } from 'zod';
import { verifyCurrentPassword } from '../../lib/session.js';
import { getClientIp, hashIp } from '../../lib/crypto.js';
import { allowRequest } from '../../lib/rate-limit.js';

const app = new Hono();

const bodySchema = z.object({
  password: z.string().min(1).max(256),
});

app.post('/', async (c) => {
  // Rate-Limit: max. 10 Versuche pro 5 Minuten pro IP-Hash.
  // Password-Verify wird beim Admin-Einstellungs-Flow verwendet — ohne
  // Limit könnte ein Angreifer mit gültiger Session dennoch das Passwort
  // brute-forcen um z.B. Re-Auth-geschützte Actions zu umgehen.
  const ip = getClientIp(c.req.raw, c.req.raw.headers);
  const ipHash = hashIp(ip);
  if (!allowRequest(`pw-verify:${ipHash}`, 10, 5 * 60_000)) {
    return c.json({ ok: false, message: 'Zu viele Versuche. Bitte später erneut.' }, 429);
  }

  const ct = c.req.header('content-type') || '';
  if (!ct.includes('application/json')) {
    return c.json({ ok: false }, 400);
  }
  let body: unknown;
  try { body = await c.req.json(); }
  catch { return c.json({ ok: false }, 400); }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false }, 400);

  const ok = verifyCurrentPassword(parsed.data.password);
  return c.json({ ok }, ok ? 200 : 401);
});

export default app;
