/**
 * Public Push-Routes:
 *   GET  /push/vapid       — liefert VAPID Public Key für Client-Subscribe
 *   POST /push/subscribe   — speichert eine neue Subscription (idempotent per endpoint)
 *   POST /push/unsubscribe — entfernt eine Subscription per endpoint
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { getClientIp, hashIp } from '../lib/crypto.js';
import { allowRequest } from '../lib/rate-limit.js';
import { loadVapidConfig } from '../lib/web-push.js';

const app = new Hono();

const subscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url().max(1024),
    keys: z.object({
      p256dh: z.string().min(10).max(256),
      auth: z.string().min(10).max(128),
    }),
  }),
  userAgent: z.string().max(500).optional(),
  lang: z.string().max(16).optional(),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url().max(1024),
});

app.get('/vapid', (c) => {
  const vapid = loadVapidConfig();
  if (!vapid) {
    return c.json({ error: 'push not configured' }, 503);
  }
  return c.json({ publicKey: vapid.publicKey });
});

app.post('/subscribe', async (c) => {
  // Rate-Limit: 20 Subscribes pro Stunde pro IP.
  const ip = getClientIp(c.req.raw, c.req.raw.headers);
  if (!allowRequest('push-sub:' + hashIp(ip), 20, 60 * 60_000)) {
    return c.json({ success: false, message: 'Zu viele Versuche' }, 429);
  }

  let body;
  try { body = await c.req.json(); } catch {
    return c.json({ success: false, message: 'invalid json' }, 400);
  }

  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, message: 'invalid payload' }, 400);
  }

  const { subscription, userAgent, lang } = parsed.data;

  // Upsert auf endpoint — gleiche Subscription wird nur aktualisiert.
  await db
    .insert(schema.pushSubscriptions)
    .values({
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userAgent: userAgent?.slice(0, 500),
      lang: lang?.slice(0, 16) || 'de-DE',
      enabled: true,
    })
    .onConflictDoUpdate({
      target: schema.pushSubscriptions.endpoint,
      set: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userAgent: userAgent?.slice(0, 500),
        lang: lang?.slice(0, 16) || 'de-DE',
        enabled: true,
        lastSeenAt: sql`NOW()`,
        failureCount: 0,
      },
    });

  return c.json({ success: true });
});

app.post('/unsubscribe', async (c) => {
  let body;
  try { body = await c.req.json(); } catch {
    return c.json({ success: false, message: 'invalid json' }, 400);
  }
  const parsed = unsubscribeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, message: 'invalid payload' }, 400);
  }
  await db
    .delete(schema.pushSubscriptions)
    .where(eq(schema.pushSubscriptions.endpoint, parsed.data.endpoint));
  return c.json({ success: true });
});

export default app;
