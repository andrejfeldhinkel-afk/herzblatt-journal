/**
 * GET /admin/purchases.csv
 *
 * CSV-Export aller E-Book-Käufe für Buchhaltung/Steuerberater.
 * Bearer-ADMIN_TOKEN protected.
 */
import { Hono } from 'hono';
import { desc } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';

const app = new Hono();

function csvEsc(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

app.get('/', async (c) => {
  const rows = await db
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
    .orderBy(desc(schema.purchases.createdAt));

  const lines = [
    'date,id,provider,order_id,email,product,amount_eur,currency,status',
  ];

  for (const r of rows) {
    const ts = r.createdAt instanceof Date
      ? r.createdAt.toISOString().replace('T', ' ').slice(0, 19)
      : String(r.createdAt);
    const amount = (r.amountCents / 100).toFixed(2).replace('.', ',');
    lines.push(
      [
        csvEsc(ts),
        csvEsc(r.id),
        csvEsc(r.provider),
        csvEsc(r.orderId),
        csvEsc(r.email),
        csvEsc(r.product),
        csvEsc(amount),
        csvEsc(r.currency),
        csvEsc(r.status),
      ].join(','),
    );
  }

  const dateStr = new Date().toISOString().slice(0, 10);

  return new Response(lines.join('\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="herzblatt-purchases-${dateStr}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
});

export default app;
