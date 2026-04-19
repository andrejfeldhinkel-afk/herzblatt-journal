/**
 * GET /herzraum/purchases
 *
 * Liste aller E-Book-Käufe (alle Provider) für das Admin-Dashboard.
 * Session-Cookie-protected (unter /herzraum/* mit requireSession mounted).
 *
 * Query:
 *   ?limit=100       (max 500, default 100)
 *   ?provider=whop   optional, filtert auf einen Provider (digistore24|whop|micropayment|...)
 *
 * Response: {
 *   total, paid, refunded, chargeback,
 *   revenue_cents: { all, paid, refunded },
 *   by_provider: [{ provider, count, paid_count, revenue_paid_cents,
 *                   revenue_paid_30d_cents }],
 *   items: [{ id, provider, orderId, email, product, amountCents,
 *             currency, status, createdAt }]
 * }
 */
import { Hono } from 'hono';
import { desc, sql, eq } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';

const app = new Hono();

app.get('/', async (c) => {
  const limitRaw = Number(c.req.query('limit') || '100');
  const limit = Math.min(Math.max(limitRaw, 1), 500);
  const providerFilter = (c.req.query('provider') || '').trim().toLowerCase();

  try {
    // Items-Query: optional nach Provider filtern
    const itemsQuery = db
      .select({
        id: schema.purchases.id,
        provider: schema.purchases.provider,
        orderId: schema.purchases.providerOrderId,
        email: schema.purchases.email,
        product: schema.purchases.product,
        amountCents: schema.purchases.amountCents,
        currency: schema.purchases.currency,
        status: schema.purchases.status,
        createdAt: schema.purchases.createdAt,
      })
      .from(schema.purchases)
      .orderBy(desc(schema.purchases.createdAt))
      .limit(limit);

    const itemsPromise = providerFilter
      ? itemsQuery.where(eq(schema.purchases.provider, providerFilter))
      : itemsQuery;

    const [items, stats, providerStats] = await Promise.all([
      itemsPromise,
      db.execute(sql`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'paid')::int AS paid,
          COUNT(*) FILTER (WHERE status = 'refunded')::int AS refunded,
          COUNT(*) FILTER (WHERE status = 'chargeback')::int AS chargeback,
          COALESCE(SUM(amount_cents), 0)::bigint AS revenue_all,
          COALESCE(SUM(amount_cents) FILTER (WHERE status = 'paid'), 0)::bigint AS revenue_paid,
          COALESCE(SUM(amount_cents) FILTER (WHERE status = 'refunded'), 0)::bigint AS revenue_refunded
        FROM purchases
      `),
      // Pro-Provider-Statistik: Gesamt-Count + bezahlte Umsätze (all-time + letzte 30 Tage)
      db.execute(sql`
        SELECT
          provider,
          COUNT(*)::int AS count,
          COUNT(*) FILTER (WHERE status = 'paid')::int AS paid_count,
          COALESCE(SUM(amount_cents) FILTER (WHERE status = 'paid'), 0)::bigint AS revenue_paid_cents,
          COALESCE(SUM(amount_cents) FILTER (WHERE status = 'paid' AND created_at > NOW() - INTERVAL '30 days'), 0)::bigint AS revenue_paid_30d_cents
        FROM purchases
        GROUP BY provider
        ORDER BY revenue_paid_cents DESC
      `),
    ]);

    const row: any = (stats as any)[0] || {};
    const providerRows = (providerStats as any[]) || [];

    return c.json({
      total: Number(row.total) || 0,
      paid: Number(row.paid) || 0,
      refunded: Number(row.refunded) || 0,
      chargeback: Number(row.chargeback) || 0,
      revenue_cents: {
        all: Number(row.revenue_all) || 0,
        paid: Number(row.revenue_paid) || 0,
        refunded: Number(row.revenue_refunded) || 0,
      },
      by_provider: providerRows.map((r: any) => ({
        provider: String(r.provider || ''),
        count: Number(r.count) || 0,
        paid_count: Number(r.paid_count) || 0,
        revenue_paid_cents: Number(r.revenue_paid_cents) || 0,
        revenue_paid_30d_cents: Number(r.revenue_paid_30d_cents) || 0,
      })),
      filter: {
        provider: providerFilter || null,
      },
      items: items.map((p) => ({
        ...p,
        createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
      })),
    });
  } catch (err) {
    console.error('[herzraum/purchases] db error:', err);
    return c.json({ error: 'DB error', message: String(err) }, 500);
  }
});

export default app;
