import { Hono } from 'hono';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { getClientIp, hashIp } from '../lib/crypto.js';
import { allowPublicApi } from '../lib/rate-limit.js';

const app = new Hono();

// Whitelist von erlaubten Affiliate-Targets — gleich wie Frontend-Version.
// Produkt-Targets (Präfix 'product-') werden dynamisch gegen die products-Tabelle
// geprüft (siehe isProductTarget unten) — so entfällt hier die Pflege.
const ALLOWED_TARGETS = new Set([
  // Eigene Dating-Brands — MÜSSEN mit den Slugs in top-dating-seiten.astro
  // datingSites-Array übereinstimmen, sonst werden Klicks silent ignoriert.
  'xloves', 'michverlieben', 'whatsmeet', 'onlydates69', 'single69', 'singlescout',
  'i-loves', 'sex69',
  // Benchmark-/Wettbewerber-Brands (für Vergleichs-Pages +
  // SEO-Hijacking-Artikel, die auf eigene Affiliate-Marken umleiten).
  'parship', 'elitepartner', 'lovescout24', 'edarling', 'bumble',
  'tinder', 'hinge', 'okcupid', 'happn', 'badoo', 'finya',
  'lovepoint', 'c-date', 'joyclub', 'secret', 'ashley-madison',
  'once', 'zoosk', 'match', 'plenty-of-fish',
  'poppen', 'poppen-de', 'lemonswan', 'lovoo',
  // Eigene Produkte (Conversion-Funnel-Tracking)
  'ebook-buy', 'ebook-buy-whop', 'ebook-buy-whop-open', 'ebook-buy-whop-complete',
  'ebook-buy-sofort', 'ebook-buy-paysafe', 'ebook-waitlist',
]);

// Prüft ob target ein dynamisch registriertes Produkt ist (products.tracking_target).
// Positive Results werden 30s gecached um DB-Roundtrips zu sparen.
const productTargetCache = new Map<string, number>(); // target -> expiresAt (ms)
const PRODUCT_CACHE_TTL_MS = 30_000;

async function isProductTarget(target: string): Promise<boolean> {
  if (!target.startsWith('product-')) return false;
  const now = Date.now();
  const cached = productTargetCache.get(target);
  if (cached && cached > now) return true;
  try {
    const [row] = await db
      .select({ id: schema.products.id })
      .from(schema.products)
      .where(eq(schema.products.trackingTarget, target))
      .limit(1);
    if (row) {
      productTargetCache.set(target, now + PRODUCT_CACHE_TTL_MS);
      // Cache-Size-Cap um Memory-Leak zu vermeiden
      if (productTargetCache.size > 500) {
        const firstKey = productTargetCache.keys().next().value;
        if (firstKey) productTargetCache.delete(firstKey);
      }
      return true;
    }
  } catch (err) {
    console.error('[track-click] product-target DB error:', err);
  }
  return false;
}

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

  // Unbekannte targets werden still ignoriert (nicht als Fehler).
  // Produkt-Targets (product-<slug>) dynamisch gegen products-Tabelle prüfen.
  if (!ALLOWED_TARGETS.has(target)) {
    const isProduct = await isProductTarget(target);
    if (!isProduct) {
      return c.json({ ok: true, ignored: true });
    }
  }

  const source = sanitizePath(body?.source || c.req.header('referer'));
  // Für product-Klicks: event-Typ defaultet auf 'product' statt 'affiliate' (besseres Grouping).
  const defaultType = target.startsWith('product-') ? 'product' : 'affiliate';
  const type = typeof body?.event === 'string' ? body.event.slice(0, 40) : defaultType;

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
