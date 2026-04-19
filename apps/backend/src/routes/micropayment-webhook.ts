/**
 * POST /api/webhooks/micropayment
 *
 * Webhook-Handler für Micropayment-Benachrichtigungen (success/refund/cancel).
 *
 * Request: POST mit form-urlencoded oder JSON body.
 * Relevante Parameter (siehe Micropayment-Doku):
 *   - amount, currency, title, mp_user_email, freeParam
 *   - event oder status: "success" | "refund" | "cancel"
 *   - transactionId oder trxId: Micropayment-Order-ID
 *   - authKey: HMAC-MD5 Signatur
 *
 * Signing-Scheme (analog zum Checkout):
 *   MD5(sortedParamsOhneAuthKey als key1value1... konkateniert + AccessKey) == authKey
 *
 * ENV:
 *   MICROPAYMENT_ACCESS_KEY          — Access-Key (signing secret)
 *   MICROPAYMENT_DISABLE_SIGNATURE   — '1' schaltet Signature-Check ab (Testmode)
 *
 * Response:
 *   "OK" bei Erfolg, "FAIL:<grund>" bei Fehler (analog Digistore-Pattern).
 */
import { Hono } from 'hono';
import { createHash } from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { addContactToList, sendWelcomeEmail, sendEbookDeliveryEmail, isSendGridEnabled, scheduleAllEbookDrips } from '../lib/sendgrid.js';
import { ensureAffiliateCodeForBuyer, creditAffiliateConversionIfRef } from '../lib/affiliate-code.js';
import { buildEbookAccessUrl } from '../lib/ebook-access.js';
import { captureError } from '../lib/sentry.js';
import { redactEmail, safeEqualHex, truncatePayload } from '../lib/log-helpers.js';
import { getClientIp, hashIp } from '../lib/crypto.js';
import { allowRequest } from '../lib/rate-limit.js';

const app = new Hono();

// 120 Webhook-POSTs pro Minute pro IP — Retries dürfen durchkommen,
// 404-Floods gegen unbekannte trxIds werden gebremst.
function allowMicropaymentWebhook(ipHash: string): boolean {
  return allowRequest('mp-wh:' + ipHash, 120, 60_000);
}

/**
 * Micropayment-Signatur prüfen (gleiches Scheme wie beim Checkout).
 * Verwendet timing-safe Vergleich gegen Timing-Attacks.
 */
function verifyMicropaymentSignature(
  params: Record<string, string>,
  accessKey: string,
): boolean {
  const authKey = params.authKey;
  if (!authKey || !accessKey) return false;

  const { authKey: _drop, ...rest } = params;

  // Nur non-empty values, alphabetisch nach key
  const keys = Object.keys(rest)
    .filter((k) => rest[k] !== undefined && rest[k] !== null && String(rest[k]).length > 0)
    .sort();

  const concatenated = keys.map((k) => `${k}${rest[k]}`).join('') + accessKey;
  const hash = createHash('md5').update(concatenated, 'utf8').digest('hex').toLowerCase();

  return safeEqualHex(hash, String(authKey));
}

app.post('/', async (c) => {
  // Rate-Limit: 120/min pro IP (Retries OK, Flood gebremst)
  const ip = getClientIp(c.req.raw, c.req.raw.headers);
  if (!allowMicropaymentWebhook(hashIp(ip))) {
    console.warn('[micropayment-webhook] rate-limit hit');
    return c.text('FAIL:rate-limit', 429, { 'Retry-After': '60' });
  }

  const ct = c.req.header('content-type') || '';
  let params: Record<string, string> = {};

  try {
    if (ct.includes('application/x-www-form-urlencoded')) {
      const form = await c.req.parseBody();
      params = Object.fromEntries(
        Object.entries(form).map(([k, v]) => [k, typeof v === 'string' ? v : '']),
      );
    } else if (ct.includes('application/json')) {
      const json = (await c.req.json()) as Record<string, unknown>;
      params = Object.fromEntries(
        Object.entries(json).map(([k, v]) => [k, v == null ? '' : String(v)]),
      );
    } else {
      // Fallback: als text lesen + als urlencoded parsen
      const text = await c.req.text();
      const sp = new URLSearchParams(text);
      params = Object.fromEntries(sp.entries());
    }
  } catch (err) {
    console.error('[micropayment-webhook] body parse error:', err);
    return c.text('FAIL:body-parse', 400);
  }

  // Signatur prüfen (falls nicht per ENV abgeschaltet)
  const accessKey = process.env.MICROPAYMENT_ACCESS_KEY || '';
  const disableSig = process.env.MICROPAYMENT_DISABLE_SIGNATURE === '1';

  if (!disableSig) {
    if (!accessKey) {
      console.error('[micropayment-webhook] MICROPAYMENT_ACCESS_KEY nicht gesetzt');
      return c.text('FAIL:no-access-key-configured', 500);
    }
    if (!verifyMicropaymentSignature(params, accessKey)) {
      console.error('[micropayment-webhook] signature mismatch');
      return c.text('FAIL:signature-invalid', 403);
    }
  } else {
    console.warn('[micropayment-webhook] signature check disabled (MICROPAYMENT_DISABLE_SIGNATURE=1)');
  }

  // Event- und Feld-Extraktion
  const event = String(params.event || params.status || 'unknown').toLowerCase();
  const email = String(params.mp_user_email || params.email || '').toLowerCase().trim();
  const orderId = String(params.transactionId || params.trxId || '').trim();
  const productName = String(params.title || 'Herzblatt-Methode').trim();
  const amountRaw = String(params.amount || '0');
  // Micropayment sendet Beträge in Cents (wie beim Checkout gesetzt)
  const amount = Math.round(parseFloat(amountRaw.replace(',', '.'))) || 0;
  const currency = String(params.currency || 'EUR').toUpperCase().slice(0, 3);

  if (!email || !orderId) {
    console.error('[micropayment-webhook] missing email or transactionId', {
      email: redactEmail(email),
      hasOrderId: !!orderId,
      event,
    });
    return c.text('FAIL:missing-required-fields', 400);
  }

  // Event-Mapping
  let status = 'paid';
  let isRelevant = true;
  switch (event) {
    case 'success':
    case 'paid':
    case 'completed':
      status = 'paid';
      break;
    case 'refund':
    case 'refunded':
      status = 'refunded';
      break;
    case 'cancel':
    case 'cancelled':
    case 'canceled':
      status = 'cancelled';
      break;
    case 'test':
    case 'connection_test':
      console.log('[micropayment-webhook] test ping received');
      return c.text('OK', 200);
    default:
      console.log('[micropayment-webhook] ignoring event:', event);
      isRelevant = false;
  }

  if (!isRelevant) return c.text('OK', 200);

  try {
    // Idempotenter Insert via UNIQUE-Index (provider, providerOrderId).
    // Siehe digistore-ipn.ts für den Rationale — gleiches Race-safe-Pattern.
    const inserted = await db
      .insert(schema.purchases)
      .values({
        provider: 'micropayment',
        providerOrderId: orderId,
        email,
        product: productName.slice(0, 100),
        amountCents: amount,
        currency,
        status,
        rawPayload: truncatePayload(params),
      })
      .onConflictDoNothing({
        target: [schema.purchases.provider, schema.purchases.providerOrderId],
      })
      .returning({ id: schema.purchases.id });

    if (inserted.length === 0) {
      // Duplicate: Row existiert bereits. Status ggf. aktualisieren
      // (z.B. paid → refunded wenn Refund nach Kauf kommt).
      const existing = await db
        .select({ id: schema.purchases.id, status: schema.purchases.status })
        .from(schema.purchases)
        .where(
          and(
            eq(schema.purchases.provider, 'micropayment'),
            eq(schema.purchases.providerOrderId, orderId),
          ),
        )
        .limit(1);

      if (existing.length > 0 && existing[0].status !== status) {
        await db
          .update(schema.purchases)
          .set({ status })
          .where(eq(schema.purchases.id, existing[0].id));
        console.log(`[micropayment-webhook] updated order ${orderId} status → ${status}`);
      } else {
        console.log(`[micropayment-webhook] duplicate webhook für ${orderId} (status unchanged)`);
      }
      return c.text('OK', 200);
    }

    console.log(`[micropayment-webhook] new purchase: ${redactEmail(email)} ${orderId} ${amount/100}${currency}`);

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
        console.error('[micropayment-webhook] subscriber upsert error:', err);
      }

      if (isSendGridEnabled()) {
        void (async () => {
          try {
            const accessUrl = buildEbookAccessUrl(email);
            await Promise.all([
              addContactToList(email, { source: 'ebook-purchase' }),
              sendWelcomeEmail(email),
              sendEbookDeliveryEmail(email, accessUrl),
              // Drip-Kampagne planen (Day 1, 7, 30) — idempotent.
              scheduleAllEbookDrips(email),
            ]);
          } catch (err) {
            console.error('[micropayment-webhook] SG post-purchase error:', err);
          }
        })();
      } else {
        void scheduleAllEbookDrips(email).catch((err) =>
          console.error('[micropayment-webhook] drip schedule error:', err),
        );
      }

      // Affiliate-Code für Käufer + ggf. Conversion-Credit für Referrer.
      void (async () => {
        try {
          await ensureAffiliateCodeForBuyer(email);
          await creditAffiliateConversionIfRef(
            c.req.header('cookie') || '',
            amount,
          );
        } catch (err) {
          console.error('[micropayment-webhook] affiliate credit error:', err);
        }
      })();
    }

    return c.text('OK', 200);
  } catch (err) {
    console.error('[micropayment-webhook] db error:', err);
    captureError(err, { route: 'micropayment-webhook', orderId, event });
    return c.text('FAIL:db-error', 500);
  }
});

// GET für HEAD-Check / liveness only — leaked KEINE Signature-Config mehr.
// Phase-4 F4.
app.get('/', (c) => {
  return c.json({ ok: true });
});

export default app;
