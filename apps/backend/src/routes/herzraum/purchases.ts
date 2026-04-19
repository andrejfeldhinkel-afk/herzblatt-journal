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
 *
 * POST /herzraum/purchases/:id/resend-access
 *   Admin-Action: sendet die Ebook-Zugangs-Mail für den gekauften Eintrag
 *   erneut. Nur für Purchases mit status='paid'. Audit-Log wird geschrieben.
 */
import { Hono } from 'hono';
import { desc, sql, eq } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { sendEbookDeliveryEmail, isSendGridEnabled } from '../../lib/sendgrid.js';
import { buildEbookAccessUrl } from '../../lib/ebook-access.js';
import { logAudit } from '../../lib/audit.js';
import { redactEmail } from '../../lib/log-helpers.js';

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

/**
 * POST /herzraum/purchases/:id/resend-access
 *
 * Admin-only: Versendet die Ebook-Zugangs-Mail für eine existierende Purchase
 * erneut. Nur für status='paid'. Rate-Limit setzt das Frontend (keine
 * Bulk-Buttons). Sendet auch wenn SendGrid deaktiviert ist — dann gibt
 * `sendEbookDeliveryEmail` einen `{ skipped: true }` zurück, den wir an das
 * UI durchreichen.
 */
app.post('/:id/resend-access', async (c) => {
  const idRaw = c.req.param('id');
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ ok: false, error: 'invalid-id' }, 400);
  }

  try {
    const rows = await db
      .select({
        id: schema.purchases.id,
        email: schema.purchases.email,
        status: schema.purchases.status,
        product: schema.purchases.product,
      })
      .from(schema.purchases)
      .where(eq(schema.purchases.id, id))
      .limit(1);

    if (rows.length === 0) {
      return c.json({ ok: false, error: 'not-found' }, 404);
    }
    const p = rows[0];
    if (p.status !== 'paid') {
      return c.json(
        { ok: false, error: 'not-paid', status: p.status },
        409,
      );
    }
    if (!p.email) {
      return c.json({ ok: false, error: 'no-email' }, 422);
    }

    if (!isSendGridEnabled()) {
      // Audit-Log trotzdem, damit klar ist dass ein Versuch gemacht wurde
      await logAudit(c, {
        action: 'ebook.resend-access',
        target: String(p.id),
        meta: { email: redactEmail(p.email), skipped: 'sendgrid-disabled' },
      });
      return c.json({
        ok: true,
        skipped: true,
        message: 'SendGrid ist nicht konfiguriert — Mail wurde nicht versendet.',
      });
    }

    let accessUrl = '';
    try {
      accessUrl = buildEbookAccessUrl(p.email);
    } catch (err) {
      // EBOOK_ACCESS_SECRET fehlt → 500
      console.error('[herzraum/purchases] token gen error:', err);
      return c.json(
        { ok: false, error: 'server-misconfigured' },
        500,
      );
    }

    const result = await sendEbookDeliveryEmail(p.email, accessUrl);

    await logAudit(c, {
      action: 'ebook.resend-access',
      target: String(p.id),
      meta: {
        email: redactEmail(p.email),
        ok: result.ok,
        status: result.status,
      },
    });

    if (!result.ok) {
      return c.json(
        { ok: false, error: 'send-failed', detail: result.error },
        502,
      );
    }

    return c.json({ ok: true, email: redactEmail(p.email) });
  } catch (err) {
    console.error('[herzraum/purchases] resend error:', err);
    return c.json({ ok: false, error: 'server-error' }, 500);
  }
});

export default app;
