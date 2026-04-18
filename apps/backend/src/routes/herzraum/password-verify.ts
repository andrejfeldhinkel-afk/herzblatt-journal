import { Hono } from 'hono';
import { z } from 'zod';
import { verifyCurrentPassword } from '../../lib/session.js';

const app = new Hono();

const bodySchema = z.object({
  password: z.string().min(1).max(256),
});

app.post('/', async (c) => {
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
