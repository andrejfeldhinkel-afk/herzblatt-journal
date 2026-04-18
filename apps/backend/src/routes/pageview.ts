import { Hono } from 'hono';
import { z } from 'zod';
import { db, schema } from '../db/index.js';
import { getClientIp, hashIp } from '../lib/crypto.js';
import { allowPublicApi } from '../lib/rate-limit.js';

const app = new Hono();

const bodySchema = z.object({
  path: z.string().min(1).max(500).regex(/^\/[a-zA-Z0-9\-_/.]+$/),
  referrer: z.string().optional(),
});

function extractReferrerHost(ref: string | null | undefined): string {
  if (!ref) return 'direct';
  try {
    return new URL(ref).hostname || 'direct';
  } catch {
    return 'direct';
  }
}

app.post('/', async (c) => {
  const ip = getClientIp(c.req.raw, c.req.raw.headers);
  if (!allowPublicApi(hashIp(ip))) {
    return c.json({ error: 'rate-limit' }, 429);
  }

  let body: unknown;
  try { body = await c.req.json(); }
  catch { return c.json({ error: 'invalid-json' }, 400); }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid-body' }, 400);
  }

  // Path-traversal safety check
  if (parsed.data.path.includes('..') || parsed.data.path.includes('//')) {
    return c.json({ error: 'invalid-path' }, 400);
  }

  const ua = (c.req.header('user-agent') || '').slice(0, 200);
  const referrerHost = extractReferrerHost(parsed.data.referrer || c.req.header('referer') || null);

  try {
    await db.insert(schema.pageviews).values({
      path: parsed.data.path,
      referrer: referrerHost,
      ua,
    });
    return c.json({ ok: true });
  } catch (err) {
    console.error('[pageview] db error:', err);
    return c.json({ ok: false }, 500);
  }
});

export default app;
