/**
 * /products — Public API für Produkt-Rendering im Frontend.
 *
 * Nur aktive Produkte. Gefiltert nach type, category, featured.
 * Für Shortcodes in Artikeln, Landingpages, Sidebar-Widgets.
 *
 * Endpoints:
 *   GET /products                  → alle aktiven (optional ?type, ?category, ?featured=true)
 *   GET /products/:slug            → ein aktives Produkt
 *   GET /products?slugs=a,b,c      → mehrere per Slug (für Artikel-Embeds)
 */
import { Hono } from 'hono';
import { db, schema } from '../db/index.js';
import { and, eq, inArray, asc, desc } from 'drizzle-orm';

const app = new Hono();

const VALID_TYPES = ['digital', 'affiliate', 'service', 'physical', 'subscription'];

app.get('/', async (c) => {
  const type = c.req.query('type');
  const category = c.req.query('category');
  const featured = c.req.query('featured');
  const slugsParam = c.req.query('slugs');

  const whereConditions = [eq(schema.products.active, true)];

  if (slugsParam) {
    const slugs = slugsParam
      .split(',')
      .map((s) => s.trim())
      .filter((s) => /^[a-z0-9-]+$/.test(s))
      .slice(0, 20);
    if (!slugs.length) return c.json({ ok: true, products: [] });
    whereConditions.push(inArray(schema.products.slug, slugs));
  }

  if (type && VALID_TYPES.includes(type)) {
    whereConditions.push(eq(schema.products.type, type));
  }
  if (category) {
    whereConditions.push(eq(schema.products.category, category));
  }
  if (featured === 'true') {
    whereConditions.push(eq(schema.products.featured, true));
  }

  const rows = await db
    .select({
      slug: schema.products.slug,
      name: schema.products.name,
      shortDescription: schema.products.shortDescription,
      longDescription: schema.products.longDescription,
      type: schema.products.type,
      source: schema.products.source,
      category: schema.products.category,
      priceCents: schema.products.priceCents,
      currency: schema.products.currency,
      imageUrl: schema.products.imageUrl,
      imageAlt: schema.products.imageAlt,
      targetUrl: schema.products.targetUrl,
      trackingTarget: schema.products.trackingTarget,
      ctaLabel: schema.products.ctaLabel,
      badges: schema.products.badges,
      rating: schema.products.rating,
      featured: schema.products.featured,
    })
    .from(schema.products)
    .where(and(...whereConditions))
    .orderBy(asc(schema.products.sortOrder), desc(schema.products.createdAt))
    .limit(100);

  const products = rows.map((p) => ({
    ...p,
    badges: safeParseBadges(p.badges),
  }));

  // 5 Min CDN-Cache, Browser 1 Min
  c.header('Cache-Control', 'public, max-age=60, s-maxage=300');
  return c.json({ ok: true, products });
});

app.get('/:slug', async (c) => {
  const slug = c.req.param('slug');
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return c.json({ ok: false, error: 'invalid-slug' }, 400);
  }

  const [row] = await db
    .select({
      slug: schema.products.slug,
      name: schema.products.name,
      shortDescription: schema.products.shortDescription,
      longDescription: schema.products.longDescription,
      type: schema.products.type,
      source: schema.products.source,
      category: schema.products.category,
      priceCents: schema.products.priceCents,
      currency: schema.products.currency,
      imageUrl: schema.products.imageUrl,
      imageAlt: schema.products.imageAlt,
      targetUrl: schema.products.targetUrl,
      trackingTarget: schema.products.trackingTarget,
      ctaLabel: schema.products.ctaLabel,
      badges: schema.products.badges,
      rating: schema.products.rating,
      featured: schema.products.featured,
    })
    .from(schema.products)
    .where(and(eq(schema.products.slug, slug), eq(schema.products.active, true)))
    .limit(1);

  if (!row) return c.json({ ok: false, error: 'not-found' }, 404);

  c.header('Cache-Control', 'public, max-age=60, s-maxage=300');
  return c.json({ ok: true, product: { ...row, badges: safeParseBadges(row.badges) } });
});

function safeParseBadges(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export default app;
