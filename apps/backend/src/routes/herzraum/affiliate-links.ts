/**
 * /herzraum/affiliate-links — CRUD für benannte Short-URLs mit Traffic-Tracking.
 *
 * Zweck: User erstellt Short-URLs wie /go/tiktok-apr-26 und postet sie in
 * Social-Media-Bios. Jeder Klick wird in der clicks-Tabelle geloggt
 * (target='link-<slug>', source=Referrer-Host). So siehst du pro Link
 * woher dein Traffic kommt.
 *
 * Endpoints:
 *   GET    /herzraum/affiliate-links          → Liste inkl. Click-Stats (gesamt + 7d + Top-Referrer)
 *   GET    /herzraum/affiliate-links/:slug    → Detail
 *   POST   /herzraum/affiliate-links          → neu anlegen
 *   PATCH  /herzraum/affiliate-links/:slug    → teil-Update (toggle active etc.)
 *   DELETE /herzraum/affiliate-links/:slug    → löschen (hard delete — clicks bleiben)
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { db, schema } from '../../db/index.js';
import { and, eq, sql, desc, type SQL, gt, inArray } from 'drizzle-orm';
import { logAudit } from '../../lib/audit.js';

const app = new Hono();

const VALID_SLUG = /^[a-z0-9][a-z0-9-]{1,60}$/;

const inputSchema = z.object({
  slug: z.string().regex(VALID_SLUG, 'Slug: klein, a-z/0-9/-, 2-60 Zeichen'),
  name: z.string().min(1).max(120),
  targetUrl: z.string().url().max(2000),
  campaign: z.string().max(60).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  active: z.boolean().default(true),
});

const updateSchema = inputSchema.partial().omit({ slug: true });

// Helper — normalisiert target-Slug zu 'link-<slug>' wie in clicks-Tabelle
function toTrackingTarget(slug: string): string {
  return `link-${slug}`;
}

// GET / — Liste aller Links mit Click-Aggregate
app.get('/', async (c) => {
  try {
    const activeParam = c.req.query('active');

    const whereConditions: SQL[] = [];
    if (activeParam === 'true') whereConditions.push(eq(schema.affiliateLinks.active, true));
    if (activeParam === 'false') whereConditions.push(eq(schema.affiliateLinks.active, false));

    const rows = await db
      .select()
      .from(schema.affiliateLinks)
      .where(whereConditions.length ? and(...whereConditions) : undefined)
      .orderBy(desc(schema.affiliateLinks.createdAt));

    // Click-Counts gesamt + letzte 7d + Top-Referrer
    const clickMap = new Map<string, { total: number; last7d: number; topRef: string | null; topRefCount: number }>();
    if (rows.length > 0) {
      const targets = rows.map((r) => toTrackingTarget(r.slug));
      const weekAgo = new Date(Date.now() - 7 * 86_400_000);

      // Gesamt-Clicks pro target
      const totalRows = await db
        .select({
          target: schema.clicks.target,
          n: sql<number>`COUNT(*)::int`.as('n'),
        })
        .from(schema.clicks)
        .where(inArray(schema.clicks.target, targets))
        .groupBy(schema.clicks.target);

      const totalMap = new Map(totalRows.map((r) => [r.target, Number(r.n)]));

      // 7-Tage-Clicks pro target
      const last7Rows = await db
        .select({
          target: schema.clicks.target,
          n: sql<number>`COUNT(*)::int`.as('n'),
        })
        .from(schema.clicks)
        .where(and(inArray(schema.clicks.target, targets), gt(schema.clicks.ts, weekAgo)))
        .groupBy(schema.clicks.target);

      const last7Map = new Map(last7Rows.map((r) => [r.target, Number(r.n)]));

      // Top-Referrer pro target (nimmt die häufigste source der letzten 30 Tage)
      const monthAgo = new Date(Date.now() - 30 * 86_400_000);
      const topRefRows = await db
        .select({
          target: schema.clicks.target,
          source: schema.clicks.source,
          n: sql<number>`COUNT(*)::int`.as('n'),
        })
        .from(schema.clicks)
        .where(and(inArray(schema.clicks.target, targets), gt(schema.clicks.ts, monthAgo)))
        .groupBy(schema.clicks.target, schema.clicks.source)
        .orderBy(desc(sql`n`));

      // Nimm pro Target den Top-Eintrag (erste Zeile da sortiert)
      const topRefMap = new Map<string, { source: string | null; count: number }>();
      for (const r of topRefRows) {
        if (!topRefMap.has(r.target)) {
          topRefMap.set(r.target, { source: r.source, count: Number(r.n) });
        }
      }

      for (const t of targets) {
        const top = topRefMap.get(t);
        clickMap.set(t, {
          total: totalMap.get(t) || 0,
          last7d: last7Map.get(t) || 0,
          topRef: top?.source || null,
          topRefCount: top?.count || 0,
        });
      }
    }

    const enriched = rows.map((r) => {
      const t = toTrackingTarget(r.slug);
      const stats = clickMap.get(t) || { total: 0, last7d: 0, topRef: null, topRefCount: 0 };
      return {
        ...r,
        trackingTarget: t,
        shortUrl: `/go/${r.slug}`,
        clicks: stats,
      };
    });

    return c.json({ ok: true, links: enriched });
  } catch (err) {
    console.error('[herzraum/affiliate-links GET] error:', err);
    return c.json({ ok: false, error: 'internal' }, 500);
  }
});

// GET /:slug — Detail
app.get('/:slug', async (c) => {
  const slug = c.req.param('slug');
  const [row] = await db
    .select()
    .from(schema.affiliateLinks)
    .where(eq(schema.affiliateLinks.slug, slug))
    .limit(1);
  if (!row) return c.json({ ok: false, error: 'not-found' }, 404);
  return c.json({ ok: true, link: { ...row, trackingTarget: toTrackingTarget(row.slug), shortUrl: `/go/${row.slug}` } });
});

// POST / — Neu anlegen
app.post('/', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid-json' }, 400);
  }

  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'invalid-input', issues: parsed.error.issues }, 400);
  }

  // Duplicate-Check
  const existing = await db
    .select({ id: schema.affiliateLinks.id })
    .from(schema.affiliateLinks)
    .where(eq(schema.affiliateLinks.slug, parsed.data.slug))
    .limit(1);
  if (existing.length > 0) {
    return c.json({ ok: false, error: 'slug-exists' }, 409);
  }

  try {
    const [created] = await db
      .insert(schema.affiliateLinks)
      .values({
        slug: parsed.data.slug,
        name: parsed.data.name,
        targetUrl: parsed.data.targetUrl,
        campaign: parsed.data.campaign || null,
        notes: parsed.data.notes || null,
        active: parsed.data.active,
      })
      .returning();

    await logAudit(c, { action: 'affiliate-link.create', target: parsed.data.slug, meta: { name: parsed.data.name } });

    return c.json({ ok: true, link: { ...created, trackingTarget: toTrackingTarget(created.slug), shortUrl: `/go/${created.slug}` } }, 201);
  } catch (err) {
    console.error('[herzraum/affiliate-links POST] error:', err);
    return c.json({ ok: false, error: 'internal' }, 500);
  }
});

// PATCH /:slug — teil-Update
app.patch('/:slug', async (c) => {
  const slug = c.req.param('slug');
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid-json' }, 400);
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'invalid-input', issues: parsed.error.issues }, 400);
  }

  try {
    const [updated] = await db
      .update(schema.affiliateLinks)
      .set({
        ...parsed.data,
        updatedAt: new Date(),
      })
      .where(eq(schema.affiliateLinks.slug, slug))
      .returning();

    if (!updated) return c.json({ ok: false, error: 'not-found' }, 404);

    await logAudit(c, { action: 'affiliate-link.update', target: slug, meta: parsed.data as Record<string, unknown> });

    return c.json({ ok: true, link: { ...updated, trackingTarget: toTrackingTarget(updated.slug), shortUrl: `/go/${updated.slug}` } });
  } catch (err) {
    console.error('[herzraum/affiliate-links PATCH] error:', err);
    return c.json({ ok: false, error: 'internal' }, 500);
  }
});

// DELETE /:slug — löschen
app.delete('/:slug', async (c) => {
  const slug = c.req.param('slug');
  try {
    const [deleted] = await db
      .delete(schema.affiliateLinks)
      .where(eq(schema.affiliateLinks.slug, slug))
      .returning();

    if (!deleted) return c.json({ ok: false, error: 'not-found' }, 404);

    await logAudit(c, { action: 'affiliate-link.delete', target: slug });

    return c.json({ ok: true });
  } catch (err) {
    console.error('[herzraum/affiliate-links DELETE] error:', err);
    return c.json({ ok: false, error: 'internal' }, 500);
  }
});

export default app;
