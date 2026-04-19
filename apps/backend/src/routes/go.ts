/**
 * /go/:slug — Public Short-URL Endpoint für Affiliate-Links.
 *
 * Wird vom Frontend /go/[slug].astro SSR-Page aufgerufen. Gibt die
 * target_url zurück + loggt den Klick.
 *
 * Kein Redirect hier im Backend — die Astro-Page macht den 302, damit
 * der Frontend-Proxy nicht mit Redirects umgehen muss.
 *
 * POST /go/:slug
 * Body: { referrer?, userAgent? }
 * Response: 200 { ok, targetUrl } | 404 { ok:false, error:'not-found' }
 */
import { Hono } from 'hono';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { getClientIp, hashIp } from '../lib/crypto.js';
import { allowPublicApi } from '../lib/rate-limit.js';
import {
  buildRefCookieHeader,
  incrementAffiliateClick,
  isAffiliateCodeSecretConfigured,
} from '../lib/affiliate-code.js';

const app = new Hono();

function extractReferrerHost(ref: string | null | undefined): string {
  if (!ref) return 'direct';
  try {
    const host = new URL(ref).hostname || 'direct';
    // Drop www. prefix for cleaner aggregation
    return host.replace(/^www\./, '').slice(0, 100);
  } catch {
    return 'direct';
  }
}

app.post('/:slug', async (c) => {
  const slug = c.req.param('slug');
  if (!slug || !/^[a-z0-9][a-z0-9-]{1,60}$/.test(slug)) {
    return c.json({ ok: false, error: 'invalid-slug' }, 400);
  }

  // Rate-Limit (IP-basiert)
  const ip = getClientIp(c.req.raw, c.req.raw.headers);
  if (!allowPublicApi(hashIp(ip))) {
    return c.json({ ok: false, error: 'rate-limit' }, 429);
  }

  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  // Link-Lookup
  const [link] = await db
    .select()
    .from(schema.affiliateLinks)
    .where(eq(schema.affiliateLinks.slug, slug))
    .limit(1);

  if (!link || !link.active) {
    return c.json({ ok: false, error: 'not-found' }, 404);
  }

  // Click-Log — fire-and-forget, blockiert den Redirect nicht
  const referrerHost = extractReferrerHost(body.referrer || c.req.header('referer'));
  try {
    await db.insert(schema.clicks).values({
      target: `link-${slug}`,
      source: referrerHost,
      type: 'affiliate-link',
    });
  } catch (err) {
    // Log aber nicht blocken
    console.error('[go] click-insert failed:', err);
  }

  // Campaign-Modus: targetUrl ist NULL → User landet auf Startseite mit UTM-Params.
  // Affiliate-Modus: targetUrl ist gesetzt → Redirect zur externen URL.
  let targetUrl: string;
  if (link.targetUrl) {
    targetUrl = link.targetUrl;
  } else {
    const home = new URL('https://herzblatt-journal.com/');
    home.searchParams.set('utm_source', slug);
    home.searchParams.set('utm_medium', 'campaign');
    home.searchParams.set('utm_campaign', link.campaign || slug);
    targetUrl = home.toString();
  }

  return c.json({ ok: true, targetUrl });
});

/**
 * POST /go/affiliate/:code
 *
 * Affiliate-Code-Redirect: Käufer teilt /go/affiliate/<CODE> in Social Media,
 * Besucher landen via Astro-Proxy auf /ebook?ref=<CODE>. Wir setzen einen
 * signierten Cookie hb_ref=<code>.<hmac> (30 Tage), den der Webhook bei Kauf
 * gegenchecked um Conversions zu creditieren.
 *
 * Response: 200 { ok, targetUrl, setCookie? } | 404 { ok:false }.
 * Der `setCookie` wird vom Frontend-Proxy gespiegelt (Set-Cookie-Header).
 */
app.post('/affiliate/:code', async (c) => {
  const code = c.req.param('code');
  if (!code || !/^[a-z0-9]{6,16}$/.test(code)) {
    return c.json({ ok: false, error: 'invalid-code' }, 400);
  }

  // Rate-Limit pro IP — Affiliate-Klick-Floods bremsen
  const ip = getClientIp(c.req.raw, c.req.raw.headers);
  if (!allowPublicApi(hashIp(ip))) {
    return c.json({ ok: false, error: 'rate-limit' }, 429);
  }

  // Existiert der Code?
  const [row] = await db
    .select({
      id: schema.affiliateCodes.id,
      active: schema.affiliateCodes.active,
    })
    .from(schema.affiliateCodes)
    .where(eq(schema.affiliateCodes.code, code))
    .limit(1);
  if (!row || !row.active) {
    return c.json({ ok: false, error: 'not-found' }, 404);
  }

  // Click inkrementieren (fire-and-forget — nicht-blocking)
  void incrementAffiliateClick(code);

  // Auch in die generische clicks-Tabelle loggen, damit der Admin-Dashboard
  // /herzraum/klicks den Traffic sieht (gleicher Stil wie /go/:slug).
  let referrerHost = 'direct';
  try {
    const ref = c.req.header('referer');
    if (ref) {
      const host = new URL(ref).hostname || 'direct';
      referrerHost = host.replace(/^www\./, '').slice(0, 100);
    }
  } catch {
    referrerHost = 'direct';
  }
  try {
    await db.insert(schema.clicks).values({
      target: `aff-${code}`,
      source: referrerHost,
      type: 'affiliate-code',
    });
  } catch (err) {
    console.error('[go/affiliate] click-log failed:', err);
  }

  const targetUrl = `https://herzblatt-journal.com/ebook?ref=${encodeURIComponent(code)}`;

  // Cookie nur setzen wenn Secret konfiguriert ist.
  let setCookie: string | undefined;
  if (isAffiliateCodeSecretConfigured()) {
    try {
      setCookie = buildRefCookieHeader(code);
    } catch (err) {
      console.error('[go/affiliate] cookie build failed:', err);
    }
  }

  if (setCookie) c.header('Set-Cookie', setCookie);
  return c.json({ ok: true, targetUrl, setCookie });
});

export default app;
