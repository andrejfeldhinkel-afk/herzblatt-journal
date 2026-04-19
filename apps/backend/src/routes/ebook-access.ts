/**
 * Ebook-Zugangs-Routen.
 *
 *   POST /api/ebook/request-access
 *     Body: { email }
 *     Wenn Email existiert in purchases mit status='paid' → Zugangs-Mail
 *     mit HMAC-Token verschicken.
 *     Antwort IMMER neutral (nie verraten ob Email existiert → Security).
 *     Rate-Limit: 3 Anfragen pro IP pro Stunde.
 *
 *   GET /api/ebook/verify?t=<token>&e=<email>
 *     Validiert Token via HMAC. Bei OK: Set-Cookie "hb_ebook=<email>"
 *     (HttpOnly, SameSite=Lax, 24h) und JSON { ok: true }.
 *     Frontend nutzt dies um nach dem ersten Klick ohne Token-URL zu surfen.
 *
 * ENV: EBOOK_ACCESS_SECRET (min 32 chars) — MUSS gesetzt sein, sonst 500.
 */
import { Hono } from 'hono';
import { eq, and, gte, inArray, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import {
  buildEbookAccessUrl,
  buildEbookToken,
  normalizeEmail,
  verifyEbookToken,
} from '../lib/ebook-access.js';
import { sendEbookDeliveryEmail, isSendGridEnabled } from '../lib/sendgrid.js';
import { allowRequest, allowPublicApi } from '../lib/rate-limit.js';
import { getClientIp, hashIp } from '../lib/crypto.js';
import { redactEmail } from '../lib/log-helpers.js';
import { captureError } from '../lib/sentry.js';

const app = new Hono();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// 3 Anfragen pro Stunde pro IP
const RECOVERY_MAX = 3;
const RECOVERY_WINDOW_MS = 60 * 60 * 1000;
const EBOOK_COOKIE_NAME = 'hb_ebook';
const EBOOK_COOKIE_MAX_AGE_SEC = 60 * 60 * 24; // 24h

function cookieSecurePart(): string {
  return process.env.COOKIE_SECURE === 'false' ? '' : '; Secure';
}
function cookieDomainPart(): string {
  const domain = process.env.COOKIE_DOMAIN;
  return domain ? `; Domain=${domain}` : '';
}
function buildEbookCookie(email: string): string {
  // Email-values sind URL-safe encoded, damit "+" und "=" nicht Cookie-Parsing kaputt machen
  const value = encodeURIComponent(email);
  return `${EBOOK_COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${EBOOK_COOKIE_MAX_AGE_SEC}${cookieSecurePart()}${cookieDomainPart()}`;
}

/**
 * POST /api/ebook/request-access
 *
 * Neutrale Antwort: immer { ok: true, message } — egal ob Email gefunden wurde
 * oder nicht. Verrät keine Information, ob jemand gekauft hat (GDPR + Security).
 */
app.post('/request-access', async (c) => {
  // Rate-Limit per IP-Hash (gegen Email-Enumeration-Angriffe)
  const ip = getClientIp(c.req.raw, c.req.raw.headers);
  const ipKey = `ebook-access:${hashIp(ip)}`;
  if (!allowRequest(ipKey, RECOVERY_MAX, RECOVERY_WINDOW_MS)) {
    return c.json(
      {
        ok: false,
        error: 'Zu viele Anfragen. Bitte versuch es in einer Stunde wieder.',
      },
      429,
    );
  }

  let payload: { email?: unknown } = {};
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid-json' }, 400);
  }

  const rawEmail = typeof payload.email === 'string' ? payload.email : '';
  const email = normalizeEmail(rawEmail);

  if (!email || !EMAIL_RE.test(email) || email.length > 200) {
    // Auch bei invalidem Format neutral antworten, damit kein Oracle entsteht.
    return c.json({
      ok: true,
      message:
        'Wenn wir einen Kauf unter dieser E-Mail finden, ist der Zugangs-Link gleich unterwegs.',
    });
  }

  // Suche nach einem bezahlten Kauf für diese Email
  try {
    const rows = await db
      .select({ id: schema.purchases.id })
      .from(schema.purchases)
      .where(
        and(
          eq(schema.purchases.email, email),
          eq(schema.purchases.status, 'paid'),
        ),
      )
      .limit(1);

    const found = rows.length > 0;
    const neutralResponse = {
      ok: true,
      message:
        'Wenn wir einen Kauf unter dieser E-Mail finden, ist der Zugangs-Link gleich unterwegs.',
    };

    if (!found) {
      console.log(
        '[ebook-access] recovery-request for unknown email',
        redactEmail(email),
      );
      return c.json(neutralResponse);
    }

    // Mail fire-and-forget
    if (isSendGridEnabled()) {
      void (async () => {
        try {
          const accessUrl = buildEbookAccessUrl(email);
          const result = await sendEbookDeliveryEmail(email, accessUrl);
          if (!result.ok) {
            console.error(
              '[ebook-access] delivery mail failed:',
              redactEmail(email),
              result.error,
            );
          }
        } catch (err) {
          console.error('[ebook-access] delivery mail exception:', err);
          captureError(err, { route: 'ebook-access.request' });
        }
      })();
    } else {
      console.warn(
        '[ebook-access] SendGrid disabled — recovery-mail skipped for',
        redactEmail(email),
      );
    }

    return c.json(neutralResponse);
  } catch (err) {
    console.error('[ebook-access] db error:', err);
    captureError(err, { route: 'ebook-access.request' });
    return c.json({ ok: false, error: 'server-error' }, 500);
  }
});

/**
 * GET /api/ebook/verify?t=<token>&e=<email>
 *
 * Validiert Token. Bei OK: setzt Cookie "hb_ebook=<email>" für 24h.
 * Frontend kann dann auf /ebook/lesen ohne Token-URL weitersurfen.
 */
app.get('/verify', (c) => {
  const token = String(c.req.query('t') || '').trim();
  const emailRaw = String(c.req.query('e') || '').trim();
  const email = normalizeEmail(emailRaw);

  if (!token || !email) {
    return c.json({ ok: false, error: 'missing-params' }, 400);
  }

  let ok = false;
  try {
    ok = verifyEbookToken(email, token);
  } catch (err) {
    // Secret nicht gesetzt → 500
    console.error('[ebook-access] verify error:', err);
    return c.json({ ok: false, error: 'server-misconfigured' }, 500);
  }

  if (!ok) {
    return c.json({ ok: false, error: 'invalid-token' }, 403);
  }

  // 24h-Session-Cookie. HttpOnly + SameSite=Lax, damit Browser ihn bei
  // Navigation auf /ebook/lesen mitschickt.
  c.header('Set-Cookie', buildEbookCookie(email));
  return c.json({ ok: true, email });
});

/**
 * GET /api/ebook/session
 *
 * Wird vom Frontend-SSR für /ebook/lesen genutzt: checkt das Cookie
 * "hb_ebook", validiert gegen DB (purchases.status='paid') und gibt
 * die Käufer-Email zurück. Fehlt Cookie oder ist Kauf nicht mehr 'paid'
 * (z.B. refunded) → 401.
 */
app.get('/session', async (c) => {
  const cookieHeader = c.req.header('cookie') || '';
  const match = /(?:^|;\s*)hb_ebook=([^;]+)/.exec(cookieHeader);
  if (!match) {
    return c.json({ ok: false, error: 'no-session' }, 401);
  }
  const email = normalizeEmail(decodeURIComponent(match[1]));
  if (!email) {
    return c.json({ ok: false, error: 'invalid-session' }, 401);
  }

  try {
    const rows = await db
      .select({ id: schema.purchases.id })
      .from(schema.purchases)
      .where(
        and(
          eq(schema.purchases.email, email),
          eq(schema.purchases.status, 'paid'),
        ),
      )
      .limit(1);

    if (rows.length === 0) {
      return c.json({ ok: false, error: 'no-paid-purchase' }, 401);
    }
    return c.json({ ok: true, email });
  } catch (err) {
    console.error('[ebook-access] session lookup error:', err);
    return c.json({ ok: false, error: 'server-error' }, 500);
  }
});

/**
 * GET /api/ebook/token-for?e=<email>  (nur für SSR von /ebook/lesen via Cookie)
 *
 * Wird nicht direkt vom Client genutzt. Der Frontend-Proxy prüft Cookie,
 * rechnet dann per HMAC den Token für die Page-Renderings nach.
 * Nicht public exponiert — keine route, nur Helper.
 */

/**
 * GET /api/ebook/recent-buyers — Public Social-Proof-Counter.
 *
 * Liefert die echte Anzahl der bezahlten Ebook-Käufe der letzten 24h
 * (NICHT gefaked, UWG § 5-konform). Frontend nutzt das für den
 * "🔥 {count} Käufer in den letzten 24h"-Hinweis auf /ebook.
 *
 * Filter:
 *   - status = 'paid' (ohne refunded / chargeback)
 *   - product IN ('ebook', 'herzblatt-methode', 'whop-ebook')
 *   - created_at > NOW() - INTERVAL '24 hours'
 *
 * Response: { ok: true, count: number }
 * Keine PII im Response — nur aggregierter Count.
 *
 * Cache: 30s public/CDN — Social-Proof darf kurz stale sein.
 * Rate-Limit: shared Public-API (60 req/min/IP).
 */
const EBOOK_PRODUCT_IDS = ['ebook', 'herzblatt-methode', 'whop-ebook'];

app.get('/recent-buyers', async (c) => {
  const ip = getClientIp(c.req.raw, c.req.raw.headers);
  if (!allowPublicApi(hashIp(ip))) {
    return c.json({ ok: false, error: 'rate-limit' }, 429);
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  try {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.purchases)
      .where(
        and(
          eq(schema.purchases.status, 'paid'),
          inArray(schema.purchases.product, EBOOK_PRODUCT_IDS),
          gte(schema.purchases.createdAt, since),
        ),
      );

    const count = Number(row?.count || 0);
    c.header('Cache-Control', 'public, max-age=30, s-maxage=30');
    return c.json({ ok: true, count });
  } catch (err) {
    console.error('[ebook-recent-buyers] db error:', err);
    // Fail-graceful: count=0 → Frontend rendert neutralen Text statt Broken-UI.
    return c.json({ ok: true, count: 0 });
  }
});

// GET / — setup-check
app.get('/', (c) => {
  return c.json({
    ok: true,
    info: 'Ebook-Access endpoints. POST /request-access + GET /verify + GET /session + GET /recent-buyers.',
    secretConfigured: !!process.env.EBOOK_ACCESS_SECRET,
  });
});

export default app;

/**
 * Helper (intern): Token erzeugen — für Webhooks, die nach erfolgreichem Kauf
 * die Delivery-URL bauen wollen.
 */
export { buildEbookAccessUrl, buildEbookToken };
