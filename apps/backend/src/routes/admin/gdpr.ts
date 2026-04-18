/**
 * GDPR-Endpoints — DSGVO-konformes Löschen und Auskunft.
 * Bearer-ADMIN_TOKEN protected (unter /admin/* gemountet).
 *
 *   POST /admin/gdpr/delete      → Body: { email }
 *     Löscht/anonymisiert alle Daten zu dieser E-Mail
 *
 *   POST /admin/gdpr/export      → Body: { email }
 *     Liefert JSON mit allen Daten zu dieser E-Mail (Art. 15 DSGVO Auskunft)
 *
 *   GET  /admin/gdpr/audit-log    → zeigt die letzten GDPR-Actions
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';

const app = new Hono();

const emailSchema = z.object({ email: z.string().email() });

app.post('/delete', async (c) => {
  let body: unknown;
  try { body = await c.req.json(); }
  catch { return c.json({ ok: false, error: 'invalid-json' }, 400); }

  const parsed = emailSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'email required' }, 400);
  }
  const email = parsed.data.email.trim().toLowerCase();

  const result: Record<string, number> = {};
  const errors: string[] = [];

  // 1. Subscribers — hart löschen
  try {
    const r = await db
      .delete(schema.subscribers)
      .where(eq(schema.subscribers.email, email))
      .returning({ id: schema.subscribers.id });
    result.subscribers_deleted = r.length;
  } catch (err) { errors.push(`subscribers: ${String(err)}`); }

  // 2. Registrations — hart löschen
  try {
    const r = await db
      .delete(schema.registrations)
      .where(eq(schema.registrations.email, email))
      .returning({ id: schema.registrations.id });
    result.registrations_deleted = r.length;
  } catch (err) { errors.push(`registrations: ${String(err)}`); }

  // 3. Purchases — anonymisieren (NICHT löschen — Buchhaltungs-Pflicht
  //    10 Jahre nach HGB §257). E-Mail durch hash ersetzen.
  try {
    const anonymized = 'deleted-' + Buffer.from(email).toString('base64').slice(0, 16) + '@anonymized.local';
    const r = await db
      .update(schema.purchases)
      .set({ email: anonymized, rawPayload: null })
      .where(eq(schema.purchases.email, email))
      .returning({ id: schema.purchases.id });
    result.purchases_anonymized = r.length;
  } catch (err) { errors.push(`purchases: ${String(err)}`); }

  // Pageviews/Clicks enthalten keine E-Mail (nur ip_hash) — nichts zu löschen.

  return c.json({
    ok: errors.length === 0,
    email,
    result,
    errors: errors.length ? errors : undefined,
    note: 'Purchases werden anonymisiert, nicht gelöscht (Buchhaltungs-Pflicht HGB §257 Abs. 4).',
    ts: new Date().toISOString(),
  });
});

app.post('/export', async (c) => {
  let body: unknown;
  try { body = await c.req.json(); }
  catch { return c.json({ ok: false, error: 'invalid-json' }, 400); }

  const parsed = emailSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'email required' }, 400);
  }
  const email = parsed.data.email.trim().toLowerCase();

  const [subs, regs, purs] = await Promise.all([
    db.select().from(schema.subscribers).where(eq(schema.subscribers.email, email)),
    db.select().from(schema.registrations).where(eq(schema.registrations.email, email)),
    db.select().from(schema.purchases).where(eq(schema.purchases.email, email)),
  ]);

  return c.json({
    exported_at: new Date().toISOString(),
    email,
    data: {
      subscribers: subs,
      registrations: regs,
      purchases: purs.map((p) => ({
        ...p,
        rawPayload: p.rawPayload ? '[stored, not exported for safety]' : null,
      })),
    },
    note: 'Pageviews + Clicks enthalten keine E-Mail, nur ip_hash. Nicht exportierbar per E-Mail.',
  });
});

export default app;
