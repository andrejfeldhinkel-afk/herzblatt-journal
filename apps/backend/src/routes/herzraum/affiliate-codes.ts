/**
 * /herzraum/affiliate-codes — Admin-Übersicht aller Käufer-Affiliate-Codes.
 *
 * GET /herzraum/affiliate-codes
 *   → { ok, codes: [{ code, ownerEmail, clicks, conversions, payoutCents, ... }] }
 *
 * PATCH /herzraum/affiliate-codes/:code
 *   Body: { active: boolean }  → aktivieren/deaktivieren.
 *   Hart-deaktiviert heißt: /go/affiliate/:code → 404, Conversions werden
 *   nicht mehr credited. Der Code bleibt in der DB für Audit.
 *
 * Kein Create/Delete hier — Codes entstehen automatisch bei Kauf.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { db, schema } from '../../db/index.js';
import { desc, eq } from 'drizzle-orm';
import { logAudit } from '../../lib/audit.js';

const app = new Hono();

app.get('/', async (c) => {
  try {
    const rows = await db
      .select()
      .from(schema.affiliateCodes)
      .orderBy(desc(schema.affiliateCodes.createdAt))
      .limit(500);

    // Summary-Stats
    const summary = rows.reduce(
      (acc, r) => {
        acc.totalClicks += Number(r.clicks) || 0;
        acc.totalConversions += Number(r.conversions) || 0;
        acc.totalPayoutCents += Number(r.payoutCents) || 0;
        if (r.active) acc.activeCount++;
        return acc;
      },
      { totalClicks: 0, totalConversions: 0, totalPayoutCents: 0, activeCount: 0 },
    );

    return c.json({
      ok: true,
      codes: rows,
      summary: {
        ...summary,
        totalCodes: rows.length,
      },
    });
  } catch (err) {
    console.error('[herzraum/affiliate-codes GET] error:', err);
    return c.json({ ok: false, error: 'internal' }, 500);
  }
});

const patchSchema = z.object({
  active: z.boolean().optional(),
});

app.patch('/:code', async (c) => {
  const code = c.req.param('code');
  if (!code || !/^[a-z0-9]{6,16}$/.test(code)) {
    return c.json({ ok: false, error: 'invalid-code' }, 400);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid-json' }, 400);
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return c.json({ ok: false, error: 'invalid-input' }, 400);
  }

  try {
    const [updated] = await db
      .update(schema.affiliateCodes)
      .set({ ...parsed.data })
      .where(eq(schema.affiliateCodes.code, code))
      .returning();
    if (!updated) return c.json({ ok: false, error: 'not-found' }, 404);

    await logAudit(c, {
      action: 'affiliate-code.update',
      target: code,
      meta: parsed.data,
    });

    return c.json({ ok: true, code: updated });
  } catch (err) {
    console.error('[herzraum/affiliate-codes PATCH] error:', err);
    return c.json({ ok: false, error: 'internal' }, 500);
  }
});

/**
 * GET /herzraum/affiliate-codes/mine?email=<email>
 *
 * Für den Käufer-Self-Service-View auf /ebook/lesen: gibt den Code +
 * Stats des angegebenen Owners zurück. Wird aktuell NICHT public
 * exponiert — nur intern-admin. Das Käufer-Widget nutzt eine separate
 * public Route mit Token-Auth (siehe /api/ebook/my-affiliate-code).
 */
app.get('/mine', async (c) => {
  const email = (c.req.query('email') || '').toLowerCase().trim();
  if (!email) return c.json({ ok: false, error: 'email-required' }, 400);
  const [row] = await db
    .select()
    .from(schema.affiliateCodes)
    .where(eq(schema.affiliateCodes.ownerEmail, email))
    .limit(1);
  if (!row) return c.json({ ok: false, error: 'not-found' }, 404);
  return c.json({ ok: true, code: row });
});

export default app;
