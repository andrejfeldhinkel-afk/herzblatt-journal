/**
 * /herzraum/products — CRUD für Produkte (Monetarisierung).
 *
 * Session-Cookie-Auth (via /herzraum/* Middleware).
 *
 * Endpoints:
 *   GET    /herzraum/products                    → Liste (optional ?type, ?active, ?category)
 *   GET    /herzraum/products/:slug              → Detail inkl. Click-Count
 *   POST   /herzraum/products                    → neu anlegen
 *   PATCH  /herzraum/products/:slug              → teil-Update
 *   DELETE /herzraum/products/:slug              → löschen
 *   POST   /herzraum/products/:slug/toggle-featured
 *   POST   /herzraum/products/:slug/toggle-active
 *
 * trackingTarget wird auto-generiert aus slug ('product-<slug>') wenn nicht
 * explizit gesetzt. Damit ist der Wert für /track-click global eindeutig.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { db, schema } from '../../db/index.js';
import { and, eq, sql, desc, asc, type SQL } from 'drizzle-orm';
import { logAudit } from '../../lib/audit.js';

const app = new Hono();

const VALID_TYPES = ['digital', 'affiliate', 'service', 'physical', 'subscription'] as const;
const VALID_SLUG = /^[a-z0-9][a-z0-9-]{1,80}$/;

const productInputSchema = z.object({
  slug: z.string().regex(VALID_SLUG, 'Slug muss klein, a-z/0-9/-, 2-80 Zeichen sein'),
  name: z.string().min(1).max(200),
  shortDescription: z.string().max(500).optional().nullable(),
  longDescription: z.string().max(5000).optional().nullable(),
  type: z.enum(VALID_TYPES),
  source: z.string().min(1).max(50).default('direct'),
  category: z.string().max(50).optional().nullable(),
  priceCents: z.number().int().min(0).max(999999900).optional().nullable(),
  currency: z.string().length(3).default('EUR'),
  imageUrl: z.string().max(500).optional().nullable(),
  imageAlt: z.string().max(300).optional().nullable(),
  targetUrl: z.string().url().max(1000),
  trackingTarget: z.string().regex(/^[a-z0-9-]+$/).max(50).optional(),
  ctaLabel: z.string().max(60).default('Jetzt ansehen'),
  badges: z.array(z.string().max(30)).max(5).optional(),
  rating: z.string().regex(/^[0-5](\.\d)?$/).optional().nullable(),
  commissionNote: z.string().max(500).optional().nullable(),
  featured: z.boolean().default(false),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(999999).default(100),
});

const productUpdateSchema = productInputSchema.partial().omit({ slug: true });

// GET / — Liste aller Produkte
app.get('/', async (c) => {
  try {
    const type = c.req.query('type');
    const activeParam = c.req.query('active');
    const category = c.req.query('category');

    const whereConditions: SQL[] = [];
    if (type && (VALID_TYPES as readonly string[]).includes(type)) {
      whereConditions.push(eq(schema.products.type, type));
    }
    if (activeParam === 'true') whereConditions.push(eq(schema.products.active, true));
    if (activeParam === 'false') whereConditions.push(eq(schema.products.active, false));
    if (category) whereConditions.push(eq(schema.products.category, category));

    const rows = await db
      .select()
      .from(schema.products)
      .where(whereConditions.length ? and(...whereConditions) : undefined)
      .orderBy(asc(schema.products.sortOrder), desc(schema.products.createdAt));

    // Click-Counts per product (aus clicks-Tabelle).
    // Nur wenn Produkte existieren — sonst SQL-Error `IN ()`.
    const clickMap = new Map<string, number>();
    if (rows.length > 0) {
      try {
        const targets = rows.map((r) => r.trackingTarget);
        const clickCounts = await db.execute<{ target: string; cnt: number }>(sql`
          SELECT target, COUNT(*)::int AS cnt
          FROM clicks
          WHERE target IN (${sql.join(targets.map((t) => sql`${t}`), sql`, `)})
          GROUP BY target
        `);
        for (const row of (clickCounts as any[])) {
          clickMap.set(row.target, Number(row.cnt) || 0);
        }
      } catch (err) {
        console.error('[products:list] click-count error (non-fatal):', err);
      }
    }

    const products = rows.map((p) => ({
      ...p,
      badges: safeParseBadges(p.badges),
      clicks: clickMap.get(p.trackingTarget) || 0,
    }));

    return c.json({ ok: true, products });
  } catch (err: any) {
    console.error('[products:list] error:', err);
    return c.json({ ok: false, error: err.message || 'db error' }, 500);
  }
});

// GET /:slug — Detail
app.get('/:slug', async (c) => {
  const slug = c.req.param('slug');
  const [row] = await db
    .select()
    .from(schema.products)
    .where(eq(schema.products.slug, slug))
    .limit(1);

  if (!row) return c.json({ ok: false, error: 'not-found' }, 404);

  const [clicksRow] = await db.execute<{ cnt: number }>(sql`
    SELECT COUNT(*)::int AS cnt FROM clicks WHERE target = ${row.trackingTarget}
  `) as any;

  return c.json({
    ok: true,
    product: {
      ...row,
      badges: safeParseBadges(row.badges),
      clicks: Number((clicksRow as any)?.cnt) || 0,
    },
  });
});

// POST / — neu anlegen
app.post('/', async (c) => {
  let body: any;
  try { body = await c.req.json(); }
  catch { return c.json({ ok: false, error: 'invalid-json' }, 400); }

  const parsed = productInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'validation', issues: parsed.error.flatten() }, 400);
  }
  const data = parsed.data;

  // Slug-Check
  const [existing] = await db
    .select({ id: schema.products.id })
    .from(schema.products)
    .where(eq(schema.products.slug, data.slug))
    .limit(1);
  if (existing) {
    return c.json({ ok: false, error: 'slug-taken' }, 409);
  }

  const trackingTarget = data.trackingTarget || `product-${data.slug}`.slice(0, 50);

  try {
    const [created] = await db.insert(schema.products).values({
      slug: data.slug,
      name: data.name,
      shortDescription: data.shortDescription || null,
      longDescription: data.longDescription || null,
      type: data.type,
      source: data.source,
      category: data.category || null,
      priceCents: data.priceCents ?? null,
      currency: data.currency,
      imageUrl: data.imageUrl || null,
      imageAlt: data.imageAlt || null,
      targetUrl: data.targetUrl,
      trackingTarget,
      ctaLabel: data.ctaLabel,
      badges: data.badges ? JSON.stringify(data.badges) : null,
      rating: data.rating || null,
      commissionNote: data.commissionNote || null,
      featured: data.featured,
      active: data.active,
      sortOrder: data.sortOrder,
    }).returning();

    await logAudit(c, {
      action: 'product.create',
      target: data.slug,
      meta: { type: data.type, source: data.source, name: data.name },
    });

    return c.json({ ok: true, product: { ...created, badges: safeParseBadges(created.badges) } }, 201);
  } catch (err: any) {
    console.error('[products:create] error:', err);
    return c.json({ ok: false, error: err.message || 'db error' }, 500);
  }
});

// PATCH /:slug — teil-update
app.patch('/:slug', async (c) => {
  const slug = c.req.param('slug');
  let body: any;
  try { body = await c.req.json(); }
  catch { return c.json({ ok: false, error: 'invalid-json' }, 400); }

  const parsed = productUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'validation', issues: parsed.error.flatten() }, 400);
  }

  const [existing] = await db
    .select()
    .from(schema.products)
    .where(eq(schema.products.slug, slug))
    .limit(1);
  if (!existing) return c.json({ ok: false, error: 'not-found' }, 404);

  const data = parsed.data;
  const patch: Record<string, any> = { updatedAt: new Date() };

  if (data.name !== undefined) patch.name = data.name;
  if (data.shortDescription !== undefined) patch.shortDescription = data.shortDescription || null;
  if (data.longDescription !== undefined) patch.longDescription = data.longDescription || null;
  if (data.type !== undefined) patch.type = data.type;
  if (data.source !== undefined) patch.source = data.source;
  if (data.category !== undefined) patch.category = data.category || null;
  if (data.priceCents !== undefined) patch.priceCents = data.priceCents;
  if (data.currency !== undefined) patch.currency = data.currency;
  if (data.imageUrl !== undefined) patch.imageUrl = data.imageUrl || null;
  if (data.imageAlt !== undefined) patch.imageAlt = data.imageAlt || null;
  if (data.targetUrl !== undefined) patch.targetUrl = data.targetUrl;
  if (data.trackingTarget !== undefined) patch.trackingTarget = data.trackingTarget;
  if (data.ctaLabel !== undefined) patch.ctaLabel = data.ctaLabel;
  if (data.badges !== undefined) patch.badges = data.badges ? JSON.stringify(data.badges) : null;
  if (data.rating !== undefined) patch.rating = data.rating || null;
  if (data.commissionNote !== undefined) patch.commissionNote = data.commissionNote || null;
  if (data.featured !== undefined) patch.featured = data.featured;
  if (data.active !== undefined) patch.active = data.active;
  if (data.sortOrder !== undefined) patch.sortOrder = data.sortOrder;

  try {
    const [updated] = await db
      .update(schema.products)
      .set(patch)
      .where(eq(schema.products.slug, slug))
      .returning();

    await logAudit(c, {
      action: 'product.update',
      target: slug,
      meta: { changedFields: Object.keys(patch).filter((k) => k !== 'updatedAt') },
    });

    return c.json({ ok: true, product: { ...updated, badges: safeParseBadges(updated.badges) } });
  } catch (err: any) {
    console.error('[products:update] error:', err);
    return c.json({ ok: false, error: err.message || 'db error' }, 500);
  }
});

// DELETE /:slug
app.delete('/:slug', async (c) => {
  const slug = c.req.param('slug');
  const [existing] = await db
    .select({ id: schema.products.id, name: schema.products.name })
    .from(schema.products)
    .where(eq(schema.products.slug, slug))
    .limit(1);
  if (!existing) return c.json({ ok: false, error: 'not-found' }, 404);

  await db.delete(schema.products).where(eq(schema.products.slug, slug));

  await logAudit(c, {
    action: 'product.delete',
    target: slug,
    meta: { name: existing.name },
  });

  return c.json({ ok: true });
});

// POST /:slug/toggle-featured
app.post('/:slug/toggle-featured', async (c) => {
  const slug = c.req.param('slug');
  const [existing] = await db
    .select()
    .from(schema.products)
    .where(eq(schema.products.slug, slug))
    .limit(1);
  if (!existing) return c.json({ ok: false, error: 'not-found' }, 404);

  const next = !existing.featured;
  await db
    .update(schema.products)
    .set({ featured: next, updatedAt: new Date() })
    .where(eq(schema.products.slug, slug));

  await logAudit(c, { action: 'product.toggle-featured', target: slug, meta: { featured: next } });
  return c.json({ ok: true, featured: next });
});

// POST /:slug/toggle-active
app.post('/:slug/toggle-active', async (c) => {
  const slug = c.req.param('slug');
  const [existing] = await db
    .select()
    .from(schema.products)
    .where(eq(schema.products.slug, slug))
    .limit(1);
  if (!existing) return c.json({ ok: false, error: 'not-found' }, 404);

  const next = !existing.active;
  await db
    .update(schema.products)
    .set({ active: next, updatedAt: new Date() })
    .where(eq(schema.products.slug, slug));

  await logAudit(c, { action: 'product.toggle-active', target: slug, meta: { active: next } });
  return c.json({ ok: true, active: next });
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
