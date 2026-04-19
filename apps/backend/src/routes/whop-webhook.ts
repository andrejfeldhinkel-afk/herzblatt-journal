/**
 * POST /api/webhooks/whop
 *
 * Whop-Webhook-Handler.
 *
 * Request: POST mit JSON body + X-Whop-Signature Header
 * (HMAC-SHA256 mit Webhook-Secret, hex).
 *
 * Body-Shape (Whop docs):
 *   {
 *     "action": "payment.succeeded" | "membership.went_valid" | "payment.failed" | "membership.went_invalid",
 *     "data": {
 *       "id": "pay_...",
 *       "user": { "id": "...", "email": "..." },
 *       "plan_id": "plan_...",
 *       "final_amount": 89.99,
 *       "currency": "eur"
 *     }
 *   }
 *
 * ENV:
 *   WHOP_WEBHOOK_SECRET      — HMAC-Secret (aus Whop-Dashboard)
 *   WHOP_DISABLE_SIGNATURE   — '1' schaltet Signature-Check explizit ab (Testmode)
 *
 * Response: 200 JSON { ok: true } bei Erfolg, sonst JSON mit error-Feld.
 */
import { Hono } from 'hono';
import { createHmac } from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { addContactToList, sendWelcomeEmail, isSendGridEnabled } from '../lib/sendgrid.js';

const app = new Hono();

type WhopUser = {
  id?: string;
  email?: string;
};

type WhopData = {
  id?: string;
  user?: WhopUser;
  plan_id?: string;
  final_amount?: number | string;
  currency?: string;
};

type WhopWebhookBody = {
  action?: string;
  data?: WhopData;
};

/**
 * Whop-Signatur (HMAC-SHA256 hex über den rawBody mit dem Webhook-Secret).
 * Der Header kann Whop-spezifisch Präfixe haben (z.B. "sha256="); wir
 * vergleichen tolerant: entweder exact hex oder nach Präfix-Strip.
 */
function verifyWhopSignature(rawBody: string, headerValue: string, secret: string): boolean {
  if (!headerValue || !secret) return false;

  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');

  // Header kann "sha256=<hex>" oder einfach "<hex>" sein
  const received = headerValue.includes('=') ? headerValue.split('=').pop() || '' : headerValue;

  return received.toLowerCase() === expected.toLowerCase();
}

app.post('/', async (c) => {
  // RawBody lesen — wir brauchen den exakten String für HMAC
  let rawBody = '';
  try {
    rawBody = await c.req.text();
  } catch (err) {
    console.error('[whop-webhook] body read error:', err);
    return c.json({ ok: false, error: 'body-read-error' }, 400);
  }

  // Body parsen
  let body: WhopWebhookBody;
  try {
    body = JSON.parse(rawBody) as WhopWebhookBody;
  } catch (err) {
    console.error('[whop-webhook] JSON parse error:', err);
    return c.json({ ok: false, error: 'invalid-json' }, 400);
  }

  // Signatur prüfen (falls nicht explizit abgeschaltet)
  const secret = process.env.WHOP_WEBHOOK_SECRET || '';
  const disableSig = process.env.WHOP_DISABLE_SIGNATURE === '1';
  const signatureHeader = c.req.header('x-whop-signature') || c.req.header('X-Whop-Signature') || '';

  if (!disableSig) {
    if (!secret) {
      console.warn('[whop-webhook] WHOP_WEBHOOK_SECRET nicht gesetzt — signature check skipped (Testmode)');
    } else if (!verifyWhopSignature(rawBody, signatureHeader, secret)) {
      console.error('[whop-webhook] signature mismatch');
      return c.json({ ok: false, error: 'signature-invalid' }, 403);
    }
  } else {
    console.warn('[whop-webhook] signature check disabled (WHOP_DISABLE_SIGNATURE=1)');
  }

  const action = String(body.action || '').toLowerCase().trim();
  const data = body.data || {};
  const email = String(data.user?.email || '').toLowerCase().trim();
  const orderId = String(data.id || '').trim();
  const planId = String(data.plan_id || '').trim();
  const currency = String(data.currency || 'EUR').toUpperCase().slice(0, 3);

  // Action → Status mapping
  let status = '';
  let isRelevant = true;
  switch (action) {
    case 'payment.succeeded':
    case 'membership.went_valid':
      status = 'paid';
      break;
    case 'payment.failed':
      status = 'failed';
      break;
    case 'membership.went_invalid':
      status = 'refunded';
      break;
    default:
      console.log('[whop-webhook] ignoring action:', action);
      isRelevant = false;
  }

  if (!isRelevant) return c.json({ ok: true, ignored: action }, 200);

  if (!email || !orderId) {
    console.error('[whop-webhook] missing email or order id', { email, orderId, action });
    return c.json({ ok: false, error: 'missing-required-fields' }, 400);
  }

  // Betrag: final_amount kann als Float-Euro oder bereits als Cent-Integer kommen.
  // Whop-Doku: final_amount ist Decimal (EUR). Wir wandeln in Cents um.
  const finalAmountRaw = data.final_amount;
  let amountCents = 0;
  if (typeof finalAmountRaw === 'number') {
    amountCents = Math.round(finalAmountRaw * 100);
  } else if (typeof finalAmountRaw === 'string' && finalAmountRaw.length > 0) {
    const parsed = parseFloat(finalAmountRaw.replace(',', '.'));
    amountCents = Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
  }

  try {
    // Idempotenz-Check
    const existing = await db
      .select({ id: schema.purchases.id, status: schema.purchases.status })
      .from(schema.purchases)
      .where(
        and(
          eq(schema.purchases.provider, 'whop'),
          eq(schema.purchases.providerOrderId, orderId),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      if (existing[0].status !== status) {
        await db
          .update(schema.purchases)
          .set({ status })
          .where(eq(schema.purchases.id, existing[0].id));
        console.log(`[whop-webhook] updated order ${orderId} status → ${status}`);
      } else {
        console.log(`[whop-webhook] duplicate webhook für ${orderId} (status unchanged)`);
      }
      return c.json({ ok: true, updated: existing[0].id }, 200);
    }

    // Neu: insert
    const productLabel = planId ? `whop:${planId}`.slice(0, 100) : 'whop-ebook';

    await db.insert(schema.purchases).values({
      provider: 'whop',
      providerOrderId: orderId,
      email,
      product: productLabel,
      amountCents,
      currency,
      status,
      rawPayload: JSON.stringify(body).slice(0, 10_000),
    });

    console.log(`[whop-webhook] new purchase: ${email} ${orderId} ${amountCents/100}${currency} (${action})`);

    // Bei Bezahlung: Käufer als Subscriber + SendGrid-Welcome
    if (status === 'paid' && email) {
      try {
        await db
          .insert(schema.subscribers)
          .values({
            email,
            source: 'ebook-purchase',
          })
          .onConflictDoNothing({ target: schema.subscribers.email });
      } catch (err) {
        console.error('[whop-webhook] subscriber upsert error:', err);
      }

      if (isSendGridEnabled()) {
        void (async () => {
          try {
            await Promise.all([
              addContactToList(email, { source: 'ebook-purchase' }),
              sendWelcomeEmail(email),
            ]);
          } catch (err) {
            console.error('[whop-webhook] SG post-purchase error:', err);
          }
        })();
      }
    }

    return c.json({ ok: true }, 200);
  } catch (err) {
    console.error('[whop-webhook] db error:', err);
    return c.json({ ok: false, error: 'db-error' }, 500);
  }
});

// GET für Setup-Check
app.get('/', (c) => {
  return c.json({
    ok: true,
    info: 'Whop webhook endpoint. POST here from the Whop dashboard.',
    signatureConfigured: !!process.env.WHOP_WEBHOOK_SECRET,
    signatureDisabled: process.env.WHOP_DISABLE_SIGNATURE === '1',
  });
});

export default app;
