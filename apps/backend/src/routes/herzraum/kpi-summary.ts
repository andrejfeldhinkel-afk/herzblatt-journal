/**
 * GET /herzraum/stats/kpi-summary
 *
 * Liefert aggregierte KPIs fuer das Admin-Dashboard:
 *   - revenue7d:           Summe amountCents von purchases(status=paid)
 *                          der letzten 7 Tage, in Cent + formatiert
 *   - conversionRate:      clicks(target=ebook-*) / pageviews(path enthaelt /ebook)
 *                          auf 4 Nachkommastellen
 *   - topArticles7d:       Top-3 pageview-Artikel der letzten 7 Tage
 *
 * Alle Queries sind auf bestehende Indexe optimiert (ts, createdAt, status).
 * Keine neue PII — Emails werden nicht zurueckgegeben.
 */
import { Hono } from 'hono';
import { and, desc, eq, gt, like, or, sql } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';

const app = new Hono();

app.get('/', async (c) => {
  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 86_400_000);

  const [
    revenueRow,
    ebookPageviewsRow,
    ebookClicksRow,
    topArticles,
  ] = await Promise.all([
    // Revenue: nur status=paid zaehlt, nicht refunded/chargeback
    db
      .select({
        cents: sql<number>`COALESCE(SUM(${schema.purchases.amountCents}), 0)::bigint`.as('cents'),
        count: sql<number>`COUNT(*)::int`.as('count'),
      })
      .from(schema.purchases)
      .where(
        and(
          eq(schema.purchases.status, 'paid'),
          gt(schema.purchases.createdAt, sevenDaysAgo),
        ),
      ),
    // Pageviews auf /ebook-Pfaden
    db
      .select({ n: sql<number>`COUNT(*)::int`.as('n') })
      .from(schema.pageviews)
      .where(
        and(
          gt(schema.pageviews.ts, sevenDaysAgo),
          like(schema.pageviews.path, '%/ebook%'),
        ),
      ),
    // Clicks auf ebook-* targets (z.B. 'ebook-download', 'ebook-buy')
    db
      .select({ n: sql<number>`COUNT(*)::int`.as('n') })
      .from(schema.clicks)
      .where(
        and(
          gt(schema.clicks.ts, sevenDaysAgo),
          or(
            like(schema.clicks.target, 'ebook%'),
            like(schema.clicks.target, 'product-ebook%'),
          ),
        ),
      ),
    // Top-3 Artikel (7d)
    db
      .select({
        path: schema.pageviews.path,
        n: sql<number>`COUNT(*)::int`.as('n'),
      })
      .from(schema.pageviews)
      .where(gt(schema.pageviews.ts, sevenDaysAgo))
      .groupBy(schema.pageviews.path)
      .orderBy(desc(sql`n`))
      .limit(3),
  ]);

  const revenueCents = Number(revenueRow[0]?.cents || 0);
  const purchasesCount = Number(revenueRow[0]?.count || 0);
  const ebookPV = Number(ebookPageviewsRow[0]?.n || 0);
  const ebookClicks = Number(ebookClicksRow[0]?.n || 0);

  // Conversion-Rate: clicks / pageviews, in Prozent, 4 Dezimalstellen Rundung.
  // Fallback 0 wenn denominator 0 (verhindert Div-by-zero + Infinity).
  const conversionRate = ebookPV > 0
    ? Math.round((ebookClicks / ebookPV) * 10000) / 100
    : 0;

  return c.json({
    ok: true,
    range: '7d',
    revenue: {
      cents: revenueCents,
      eur: (revenueCents / 100),
      purchasesCount,
    },
    conversion: {
      ebookPageviews: ebookPV,
      ebookClicks,
      ratePercent: conversionRate,
    },
    topArticles: topArticles.map((a) => ({
      slug: a.path,
      count: Number(a.n),
    })),
  });
});

export default app;
