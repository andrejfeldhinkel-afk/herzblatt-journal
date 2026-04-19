/**
 * POST /digistore-ipn
 *
 * Digistore24 Instant Payment Notification Handler.
 *
 * Digistore24 sendet bei Kauf/Refund/Chargeback einen POST mit Form-Encoded
 * Body + sha_sign Signatur.
 *
 * Signature-Scheme (Digistore24 docs):
 *   SHA-512(key1=value1key2=value2...keyN=valueN + PASSPHRASE)
 *   - Alle Parameter außer sha_sign
 *   - Alphabetisch sortiert nach Key (case-insensitive)
 *   - Nur Parameter mit non-empty values
 *
 * ENV:
 *   DIGISTORE_IPN_PASSPHRASE — aus dem Digistore-Account
 *   DIGISTORE_DISABLE_SIGNATURE — '1' für dev/test (NIE in Prod!)
 *
 * Response: "OK" (Digistore erwartet genau das, sonst Retry).
 * Fehler: "FAIL:<grund>" → Digistore retries bis 24h.
 */
import { Hono } from 'hono';
import { createHash } from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { addContactToList, sendWelcomeEmail, isSendGridEnabled } from '../lib/sendgrid.js';
import { getClientIp, hashIp } from '../lib/crypto.js';
import { allowRequest } from '../lib/rate-limit.js';

const app = new Hono();

// 120 IPN-POSTs pro Minute pro IP — Digistore retries bis zu 24h,
// daher großzügig. Schutz gegen DB-Query-Flood bei unbekannten order_ids.
function allowDigistoreIpn(ipHash: string): boolean {
  return allowRequest('ds-ipn:' + ipHash, 120, 60_000);
}

function verifyDigistoreSignature(params: Record<string, string>, passphrase: string): boolean {
  const { sha_sign, ...rest } = params;
  if (!sha_sign || !passphrase) return false;

  // Alle non-empty params, alphabetisch nach lowercased key
  const keys = Object.keys(rest)
    .filter((k) => rest[k] !== undefined && rest[k] !== null && String(rest[k]).length > 0)
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

  const concatenated = keys.map((k) => `${k}=${rest[k]}`).join('') + passphrase;
  const hash = createHash('sha512').update(concatenated, 'utf8').digest('hex').toUpperCase();

  return hash === String(sha_sign).toUpperCase();
}

app.post('/', async (c) => {
  // Rate-Limit: 120/min pro IP (Digistore retries bis 24h, daher großzügig)
  const ip = getClientIp(c.req.raw, c.req.raw.headers);
  if (!allowDigistoreIpn(hashIp(ip))) {
    console.warn('[digistore-ipn] rate-limit hit');
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
      // fallback: als text lesen + parsen
      const text = await c.req.text();
      const sp = new URLSearchParams(text);
      params = Object.fromEntries(sp.entries());
    }
  } catch (err) {
    console.error('[digistore-ipn] body parse error:', err);
    return c.text('FAIL:body-parse', 400);
  }

  // Signatur prüfen
  const passphrase = process.env.DIGISTORE_IPN_PASSPHRASE || '';
  const disableSig = process.env.DIGISTORE_DISABLE_SIGNATURE === '1';

  if (!disableSig) {
    if (!passphrase) {
      console.error('[digistore-ipn] DIGISTORE_IPN_PASSPHRASE not set');
      return c.text('FAIL:no-passphrase-configured', 500);
    }
    if (!verifyDigistoreSignature(params, passphrase)) {
      console.error('[digistore-ipn] signature mismatch');
      return c.text('FAIL:signature-invalid', 403);
    }
  }

  // Event-Typ: Digistore sendet event-Param bei IPN v2,
  // bei Classic ist's über "pay_status" erkennbar.
  const event = String(params.event || params.pay_status || 'unknown').toLowerCase();
  const email = String(params.email || params.payer_email || '').toLowerCase().trim();
  const orderId = String(params.order_id || params.txn_id || params.order_no || '').trim();
  const productName = String(params.product_name || params.product_id || 'ebook').trim();
  const amountRaw = String(params.amount || params.total || params.payment_gross || '0');
  const amount = Math.round(parseFloat(amountRaw.replace(',', '.')) * 100) || 0;
  const currency = String(params.currency || 'EUR').toUpperCase().slice(0, 3);

  if (!email || !orderId) {
    console.error('[digistore-ipn] missing email or order_id', { email, orderId, event });
    return c.text('FAIL:missing-required-fields', 400);
  }

  // Event-Mapping
  let status = 'paid';
  let isRelevant = true;
  switch (event) {
    case 'on_payment':
    case 'completed':
    case 'paid':
      status = 'paid';
      break;
    case 'on_refund':
    case 'refund':
      status = 'refunded';
      break;
    case 'on_chargeback':
    case 'chargeback':
      status = 'chargeback';
      break;
    case 'test':
    case 'connection_test':
      // Digistore sendet bei Setup einen Test — "OK" zurückgeben, nichts speichern
      console.log('[digistore-ipn] test ping received');
      return c.text('OK', 200);
    default:
      // Alle anderen Events (z.B. on_rebill, on_missed_payment) ignorieren wir erstmal
      console.log('[digistore-ipn] ignoring event:', event);
      isRelevant = false;
  }

  if (!isRelevant) return c.text('OK', 200);

  try {
    // Idempotenter Insert via UNIQUE-Index (provider, providerOrderId).
    // Bei Konflikt kein neuer Row — anschließend ggf. Status-Update wenn
    // refund/chargeback auf einen früheren paid-Event folgt.
    //
    // Race-sicher: keine check-then-insert-Lücke mehr wie vorher. Zwei
    // parallele Requests für dieselbe order_id erzeugen genau EINE Row;
    // der zweite sieht `inserted.length === 0` und rennt in den Update-
    // Pfad, nicht in den Welcome-Mail-Pfad.
    const inserted = await db
      .insert(schema.purchases)
      .values({
        provider: 'digistore24',
        providerOrderId: orderId,
        email,
        product: productName.slice(0, 100),
        amountCents: amount,
        currency,
        status,
        rawPayload: JSON.stringify(params).slice(0, 10_000),
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
            eq(schema.purchases.provider, 'digistore24'),
            eq(schema.purchases.providerOrderId, orderId),
          ),
        )
        .limit(1);

      if (existing.length > 0 && existing[0].status !== status) {
        await db
          .update(schema.purchases)
          .set({ status })
          .where(eq(schema.purchases.id, existing[0].id));
        console.log(`[digistore-ipn] updated order ${orderId} status → ${status}`);
      } else {
        console.log(`[digistore-ipn] duplicate IPN for ${orderId} (status unchanged)`);
      }
      return c.text('OK', 200);
    }

    console.log(`[digistore-ipn] new purchase: ${email} ${orderId} ${amount/100}${currency}`);

    // Bei Bezahlung: Käufer als Subscriber + SendGrid-Welcome
    if (status === 'paid' && email) {
      try {
        // Subscriber upsert (silent wenn schon da)
        await db
          .insert(schema.subscribers)
          .values({
            email,
            source: 'ebook-purchase',
          })
          .onConflictDoNothing({ target: schema.subscribers.email });
      } catch (err) {
        console.error('[digistore-ipn] subscriber upsert error:', err);
      }

      if (isSendGridEnabled()) {
        void (async () => {
          try {
            await Promise.all([
              addContactToList(email, { source: 'ebook-purchase' }),
              sendWelcomeEmail(email),
            ]);
          } catch (err) {
            console.error('[digistore-ipn] SG post-purchase error:', err);
          }
        })();
      }
    }

    return c.text('OK', 200);
  } catch (err) {
    console.error('[digistore-ipn] db error:', err);
    return c.text('FAIL:db-error', 500);
  }
});

// GET für HEAD-Check / liveness only — leaked KEINE Signature-Config mehr.
// Phase-4 F4: öffentlicher Endpoint darf nicht verraten ob die Signatur
// deaktiviert ist (würde Angreifer direkt auf unsigned-POST hinweisen).
app.get('/', (c) => {
  return c.json({ ok: true });
});

export default app;
