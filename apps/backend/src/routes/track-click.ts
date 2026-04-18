import { Hono } from 'hono';
import { db, schema } from '../db/index.js';
import { getClientIp, hashIp } from '../lib/crypto.js';
import { allowPublicApi } from '../lib/rate-limit.js';

const app = new Hono();

// Whitelist von erlaubten Affiliate-Targets — gleich wie Frontend-Version
const ALLOWED_TARGETS = new Set([
  'xloves', 'michverlieben', 'whatsmeet', 'onlydates69', 'singles69', 'singlescout',
  'iloves', 'sex69',
  'parship', 'elitepartner', 'lovescout24', 'edarling', 'bumble',
  'tinder', 'hinge', 'okcupid', 'happn', 'badoo', 'finya',
  'lovepoint', 'c-date', 'joyclub', 'secret', 'ashley-madison',
  'once', 'zoosk', 'match', 'plenty-of-fish',
]);

const TARGET_REGEX = /^[a-z0-9-]+$/;

function sanitizePath(p: unknown): string {
  if (typeof p !== 'string') return 'unknown';
  if (!p.startsWith('/') || p.length > 200 || p.includes('..')) return 'unknown';
  if (!/^[a-zA-Z0-9\-_/.]+$/.test(p)) return 'unknown';
  return p;
}

app.post('/', async (c) => {
  const ip = getClientIp(c.req.raw, c.req.raw.headers);
  if (!allowPublicApi(hashIp(ip))) {
    return c.json({ error: 'rate-limit' }, 429);
  }

  // Accept both JSON and urlencoded (sendBeacon kann beides senden)
  let body: any = {};
  const ct = c.req.header('content-type') || '';
  if (ct.includes('application/json')) {
    try { body = await c.req.json(); }
    catch { return c.json({ error: 'invalid-json' }, 400); }
  } else {
    const text = await c.req.text();
    try { body = JSON.parse(text); }
    catch {
      body = Object.fromEntries(new URLSearchParams(text).entries());
    }
  }

  const rawTarget = typeof body?.site === 'string'
    ? body.site
    : (typeof body?.target === 'string' ? body.target : '');
  const target = rawTarget.trim().toLowerCase();

  if (!target || target.length > 50 || !TARGET_REGEX.test(target)) {
    return c.json({ error: 'invalid-target' }, 400);
  }

  // Unbekannte targets werden still ignoriert (nicht als Fehler)
  if (!ALLOWED_TARGETS.has(target)) {
    return c.json({ ok: true, ignored: true });
  }

  const source = sanitizePath(body?.source || c.req.header('referer'));
  const type = typeof body?.event === 'string' ? body.event.slice(0, 40) : 'affiliate';

  try {
    await db.insert(schema.clicks).values({
      target,
      source,
      type,
    });
    return c.json({ ok: true });
  } catch (err) {
    console.error('[track-click] db error:', err);
    return c.json({ ok: false }, 500);
  }
});

export default app;
