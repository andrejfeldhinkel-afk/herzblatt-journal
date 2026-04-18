/**
 * Admin Push-Routes (session-protected via requireSession in index.ts):
 *   GET  /herzraum/push/stats     — KPIs: active subscribers, 7d growth, last broadcasts
 *   POST /herzraum/push/broadcast — send a push to all enabled subscribers
 *   GET  /herzraum/push/test      — send a test push to the admin's own subscriptions (last 3)
 *
 * Broadcast läuft sequenziell in Batches à 50 mit Promise.allSettled — für Railway-
 * sichere Ausführung (keine Connection-Flut, aber deutlich schneller als seriell).
 * Bei 404/410 wird die Subscription automatisch gelöscht (tote Geräte).
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { and, count, desc, eq, gt, sql } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { loadVapidConfig, sendPush, type PushPayload } from '../../lib/web-push.js';
import { logAudit } from '../../lib/audit.js';

const app = new Hono();

function daysAgo(days: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return new Date(d.getTime() - days * 86_400_000);
}

app.get('/stats', async (c) => {
  const weekAgo = daysAgo(7);
  const monthAgo = daysAgo(30);

  const [activeRow, weekRow, monthRow, totalRow, disabledRow] = await Promise.all([
    db.select({ n: count() }).from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.enabled, true)),
    db
      .select({ n: count() })
      .from(schema.pushSubscriptions)
      .where(and(eq(schema.pushSubscriptions.enabled, true), gt(schema.pushSubscriptions.createdAt, weekAgo))),
    db
      .select({ n: count() })
      .from(schema.pushSubscriptions)
      .where(and(eq(schema.pushSubscriptions.enabled, true), gt(schema.pushSubscriptions.createdAt, monthAgo))),
    db.select({ n: count() }).from(schema.pushSubscriptions),
    db.select({ n: count() }).from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.enabled, false)),
  ]);

  // Recent broadcasts (last 20).
  const recent = await db
    .select()
    .from(schema.pushBroadcasts)
    .orderBy(desc(schema.pushBroadcasts.sentAt))
    .limit(20);

  // Daily-Growth-Curve für die letzten 30 Tage.
  const growthRows = await db.execute<{ day: string; n: number }>(sql`
    SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
           COUNT(*)::int AS n
    FROM push_subscriptions
    WHERE created_at > NOW() - INTERVAL '30 days'
    GROUP BY 1
    ORDER BY 1
  `);

  return c.json({
    active: activeRow[0]?.n ?? 0,
    newLast7d: weekRow[0]?.n ?? 0,
    newLast30d: monthRow[0]?.n ?? 0,
    totalEver: totalRow[0]?.n ?? 0,
    disabled: disabledRow[0]?.n ?? 0,
    vapidConfigured: loadVapidConfig() !== null,
    recentBroadcasts: recent,
    dailyGrowth: growthRows,
  });
});

const broadcastSchema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(400),
  url: z.string().min(1).max(500).default('/'),
  icon: z.string().max(500).optional(),
  image: z.string().max(500).optional(),
  tag: z.string().max(80).optional(),
  requireInteraction: z.boolean().optional(),
  dryRun: z.boolean().optional(),
});

app.post('/broadcast', async (c) => {
  const vapid = loadVapidConfig();
  if (!vapid) {
    return c.json({ success: false, message: 'VAPID nicht konfiguriert — VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY in Railway setzen.' }, 503);
  }

  let raw;
  try { raw = await c.req.json(); } catch {
    return c.json({ success: false, message: 'invalid json' }, 400);
  }
  const parsed = broadcastSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ success: false, message: 'invalid payload', errors: parsed.error.flatten() }, 400);
  }

  // Auto-UTM — wenn der Link noch keine utm_source hat, hängen wir sie an,
  // damit Broadcasts in GA sauber als Traffic-Quelle "push" erscheinen.
  function appendUtm(url: string, campaign: string): string {
    if (!url) return '/';
    try {
      // Nur bei relativen oder absoluten http(s) URLs — mailto/tel werden übersprungen.
      if (!url.startsWith('/') && !/^https?:/i.test(url)) return url;
      const u = new URL(url, 'https://herzblatt-journal.com');
      if (!u.searchParams.has('utm_source')) u.searchParams.set('utm_source', 'push');
      if (!u.searchParams.has('utm_medium')) u.searchParams.set('utm_medium', 'notification');
      if (!u.searchParams.has('utm_campaign')) u.searchParams.set('utm_campaign', campaign);
      // Relativ erhalten, wenn ursprünglich relativ war.
      return url.startsWith('/') ? u.pathname + u.search + u.hash : u.toString();
    } catch {
      return url;
    }
  }

  const subs = await db
    .select()
    .from(schema.pushSubscriptions)
    .where(eq(schema.pushSubscriptions.enabled, true));

  // Wenn Dry-Run: antworten ohne Insert — keine broadcastId nötig.
  if (parsed.data.dryRun) {
    const previewUrl = appendUtm(parsed.data.url, 'dryrun');
    return c.json({
      success: true,
      dryRun: true,
      recipientCount: subs.length,
      payload: { ...parsed.data, url: previewUrl },
    });
  }

  // Broadcast-Zeile anlegen (wird am Ende upgedatet).
  const [inserted] = await db
    .insert(schema.pushBroadcasts)
    .values({
      title: parsed.data.title,
      body: parsed.data.body,
      url: parsed.data.url,
      icon: parsed.data.icon,
      image: parsed.data.image,
      recipientCount: subs.length,
    })
    .returning({ id: schema.pushBroadcasts.id });

  const campaignTag = 'push-' + inserted!.id;
  const payload: PushPayload = {
    title: parsed.data.title,
    body: parsed.data.body,
    url: appendUtm(parsed.data.url, campaignTag),
    icon: parsed.data.icon || '/icons/icon-192.png',
    image: parsed.data.image,
    tag: parsed.data.tag,
    requireInteraction: parsed.data.requireInteraction,
    // id = broadcastId — SW liest das beim notificationclick aus und pingt /push/click
    id: inserted!.id,
  };

  let success = 0;
  let failure = 0;
  const goneEndpoints: string[] = [];

  // Batches à 50 parallel.
  const BATCH = 50;
  for (let i = 0; i < subs.length; i += BATCH) {
    const batch = subs.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map((s) =>
        sendPush(
          vapid,
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        ),
      ),
    );
    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      const sub = batch[j];
      if (r.status === 'fulfilled') {
        if (r.value.ok) {
          success++;
        } else {
          failure++;
          if (r.value.gone) goneEndpoints.push(sub.endpoint);
        }
      } else {
        failure++;
      }
    }
  }

  // Gone-Endpoints als disabled markieren (soft-delete).
  if (goneEndpoints.length > 0) {
    for (const ep of goneEndpoints) {
      await db
        .update(schema.pushSubscriptions)
        .set({ enabled: false, failureCount: sql`${schema.pushSubscriptions.failureCount} + 1` })
        .where(eq(schema.pushSubscriptions.endpoint, ep));
    }
  }

  await db
    .update(schema.pushBroadcasts)
    .set({ successCount: success, failureCount: failure })
    .where(eq(schema.pushBroadcasts.id, inserted!.id));

  await logAudit(c, {
    actor: 'admin',
    action: 'push.broadcast',
    target: `broadcast:${inserted!.id}`,
    meta: { recipientCount: subs.length, success, failure, title: payload.title },
  });

  return c.json({
    success: true,
    broadcastId: inserted!.id,
    recipientCount: subs.length,
    successCount: success,
    failureCount: failure,
    disabledCount: goneEndpoints.length,
  });
});

export default app;
