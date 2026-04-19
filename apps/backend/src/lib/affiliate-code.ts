/**
 * Affiliate-Code-System für Ebook-Käufer.
 *
 * Workflow:
 *   1. Bei erfolgreichem Kauf → ensureAffiliateCodeForBuyer(email)
 *      - generiert einen eindeutigen 8-Zeichen-Code (a-z0-9)
 *      - speichert (code, owner_email) in affiliate_codes
 *      - ein Code pro Owner (UNIQUE owner_email) — Wiederholkäufer bekommen
 *        den existierenden Code zurück.
 *
 *   2. Käufer teilt /go/affiliate/<CODE> in Social Media.
 *
 *   3. Klick-Redirect (routes/go.ts) prüft Code, inkrementiert clicks,
 *      setzt signierten Cookie "hb_ref" (Owner-unforgeable) 30 Tage.
 *
 *   4. Bei neuem Kauf → creditAffiliateConversionIfRef(cookieHeader, amountCents)
 *      - liest+verifiziert Cookie "hb_ref"
 *      - inkrementiert conversions + payout_cents (30% Default-Provision)
 *      - lookup ist HMAC-safe → keine Code-Forgery möglich.
 *
 * Sicherheit:
 *   - Code-Generierung nutzt crypto.randomBytes, nicht Math.random.
 *   - Cookie "hb_ref" ist HMAC-signed (AFFILIATE_CODE_SECRET) — ein
 *     Angreifer kann keinen gültigen ref-Cookie fürs eigene Conversion-
 *     Farming fälschen.
 *   - Selbst-Credit verhindert: wenn email === code.owner_email,
 *     werden keine Conversions/Payouts gutgeschrieben.
 *
 * ENV:
 *   AFFILIATE_CODE_SECRET — HMAC-Secret für Cookie-Signatur (min 32 chars).
 *                          Fehlt der Secret → keine Conversions, aber
 *                          die Codes selbst funktionieren (Klick-Tracking).
 */
import { createHmac, randomBytes } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { safeEqualHex } from './log-helpers.js';

const MIN_SECRET_LENGTH = 32;

// 30% Provision auf den Brutto-Umsatz. Der tatsächliche Payout erfolgt
// manuell (Banküberweisung); diese Zahl zeigt wir dem Käufer im Dashboard.
const COMMISSION_BPS = 3000; // basis points: 3000 = 30.00%

const CODE_COOKIE_NAME = 'hb_ref';
const CODE_COOKIE_MAX_AGE_SEC = 30 * 24 * 60 * 60; // 30 Tage
// 8 Zeichen aus 32er-Alphabet = 32^8 ≈ 1.1e12 — niedrige Kollisionsgefahr
// selbst bei 100k Käufern. Keine verwechselbaren Zeichen (0/o, 1/l/i).
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const CODE_LENGTH = 8;

function getAffiliateSecret(): string {
  const secret = process.env.AFFILIATE_CODE_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `AFFILIATE_CODE_SECRET env var missing or too short (min ${MIN_SECRET_LENGTH} chars)`,
    );
  }
  return secret;
}

export function isAffiliateCodeSecretConfigured(): boolean {
  const secret = process.env.AFFILIATE_CODE_SECRET;
  return !!(secret && secret.length >= MIN_SECRET_LENGTH);
}

/**
 * Generiert einen neuen Code (nicht kollisions-safe in sich selbst —
 * Retry in ensureAffiliateCodeForBuyer falls UNIQUE-Conflict).
 */
function generateRawCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

/**
 * Baut die HMAC-Signatur für einen Code. Cookie-Value-Format: "<code>.<sig>"
 * Signatur ist 16 hex-chars (8 Byte) — genug Entropie gegen Brute-Force,
 * kurz genug für Cookie-Budget.
 */
function signCode(code: string): string {
  const secret = getAffiliateSecret();
  return createHmac('sha256', secret)
    .update(code, 'utf8')
    .digest('hex')
    .slice(0, 16);
}

export function buildRefCookieValue(code: string): string {
  return `${code}.${signCode(code)}`;
}

/**
 * Prüft einen signierten Cookie-Value und gibt den Code zurück, wenn
 * gültig. null bei ungültiger/fehlender Signatur.
 */
export function verifyRefCookieValue(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const decoded = decodeURIComponent(raw);
  const lastDot = decoded.lastIndexOf('.');
  if (lastDot <= 0 || lastDot >= decoded.length - 1) return null;
  const code = decoded.slice(0, lastDot);
  const sig = decoded.slice(lastDot + 1);
  if (!/^[a-z0-9]{2,32}$/.test(code)) return null;
  if (!/^[0-9a-f]+$/.test(sig)) return null;
  let expected: string;
  try {
    expected = signCode(code);
  } catch {
    // Secret nicht konfiguriert → keine Verifikation möglich.
    return null;
  }
  if (expected.length !== sig.length) return null;
  return safeEqualHex(sig, expected) ? code : null;
}

function cookieSecurePart(): string {
  return process.env.COOKIE_SECURE === 'false' ? '' : '; Secure';
}
function cookieDomainPart(): string {
  const domain = process.env.COOKIE_DOMAIN;
  return domain ? `; Domain=${domain}` : '';
}

/**
 * Set-Cookie-Header-Value für den Ref-Cookie (signiert, 30 Tage).
 */
export function buildRefCookieHeader(code: string): string {
  const value = encodeURIComponent(buildRefCookieValue(code));
  return `${CODE_COOKIE_NAME}=${value}; Path=/; SameSite=Lax; Max-Age=${CODE_COOKIE_MAX_AGE_SEC}${cookieSecurePart()}${cookieDomainPart()}`;
}

/**
 * Extrahiert + verifiziert den Ref-Cookie aus einem Cookie-Header.
 */
export function extractRefCodeFromCookie(cookieHeader: string): string | null {
  if (!cookieHeader) return null;
  const match = /(?:^|;\s*)hb_ref=([^;]+)/.exec(cookieHeader);
  if (!match) return null;
  return verifyRefCookieValue(match[1]);
}

/**
 * Stellt sicher, dass der Käufer einen Affiliate-Code hat. Bei Wiederkauf
 * wird der existing Code zurückgegeben (UNIQUE ownerEmail).
 *
 * Kollisions-Handling: bei UNIQUE-Conflict auf `code` wird bis zu 5x
 * retried. Bei 32^8 Adressen + <100k Codes ≙ P(collision) < 10^-6 — in
 * der Praxis wird ein Retry nie passieren.
 */
export async function ensureAffiliateCodeForBuyer(email: string): Promise<string | null> {
  const normalized = email.toLowerCase().trim();
  if (!normalized) return null;

  // Existierenden Code lookup
  try {
    const existing = await db
      .select({ code: schema.affiliateCodes.code })
      .from(schema.affiliateCodes)
      .where(eq(schema.affiliateCodes.ownerEmail, normalized))
      .limit(1);
    if (existing.length > 0) return existing[0].code;
  } catch (err) {
    console.error('[affiliate-code] lookup failed:', err);
    return null;
  }

  // Neuen Code generieren mit Kollisions-Retry
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRawCode();
    try {
      const inserted = await db
        .insert(schema.affiliateCodes)
        .values({ code, ownerEmail: normalized })
        .onConflictDoNothing()
        .returning({ code: schema.affiliateCodes.code });
      if (inserted.length > 0) {
        return inserted[0].code;
      }
      // Conflict → kann sein entweder auf owner_email (Race von 2 parallelen
      // Webhook-Retries) oder auf code (Kollision). Wenn Owner-Conflict,
      // lookup returniert den existing Code.
      const existing = await db
        .select({ code: schema.affiliateCodes.code })
        .from(schema.affiliateCodes)
        .where(eq(schema.affiliateCodes.ownerEmail, normalized))
        .limit(1);
      if (existing.length > 0) return existing[0].code;
      // Sonst war's code-Kollision — next iteration generiert neuen.
    } catch (err) {
      console.error('[affiliate-code] insert attempt failed:', err);
    }
  }
  return null;
}

/**
 * Inkrementiert clicks für einen Code. Idempotenz ist NICHT erforderlich
 * — jeder Klick zählt. Rate-Limit in der Route regelt Abuse.
 */
export async function incrementAffiliateClick(code: string): Promise<boolean> {
  try {
    const updated = await db
      .update(schema.affiliateCodes)
      .set({
        clicks: sql`${schema.affiliateCodes.clicks} + 1`,
        lastClickAt: new Date(),
      })
      .where(eq(schema.affiliateCodes.code, code))
      .returning({ id: schema.affiliateCodes.id });
    return updated.length > 0;
  } catch (err) {
    console.error('[affiliate-code] click increment failed:', err);
    return false;
  }
}

/**
 * Schlüsselt den Code aus dem Cookie-Header, verifiziert + credits
 * die Conversion + Provision.
 *
 * @param cookieHeader vollständiger Cookie-Header der Webhook-Request
 * @param amountCents  gesamter Kauf-Betrag in Cents (30% → Payout)
 *
 * Kein Credit wenn:
 *   - Cookie fehlt / invalid signature
 *   - Code existiert nicht
 *   - Code ist inaktiv
 *   - Owner-Email === Käufer-Email (Self-Credit)
 *
 * @returns code + granted flag oder null
 */
export async function creditAffiliateConversionIfRef(
  cookieHeader: string,
  amountCents: number,
  buyerEmail?: string,
): Promise<{ code: string; payoutCents: number } | null> {
  const code = extractRefCodeFromCookie(cookieHeader);
  if (!code) return null;

  try {
    const [row] = await db
      .select()
      .from(schema.affiliateCodes)
      .where(eq(schema.affiliateCodes.code, code))
      .limit(1);
    if (!row || !row.active) return null;
    if (buyerEmail && row.ownerEmail.toLowerCase() === buyerEmail.toLowerCase()) {
      // Self-Credit verhindern
      return null;
    }
    const payoutCents = Math.max(0, Math.floor((amountCents * COMMISSION_BPS) / 10000));
    await db
      .update(schema.affiliateCodes)
      .set({
        conversions: sql`${schema.affiliateCodes.conversions} + 1`,
        payoutCents: sql`${schema.affiliateCodes.payoutCents} + ${payoutCents}`,
        lastConversionAt: new Date(),
      })
      .where(eq(schema.affiliateCodes.id, row.id));
    return { code, payoutCents };
  } catch (err) {
    console.error('[affiliate-code] credit failed:', err);
    return null;
  }
}

export const AFFILIATE_COMMISSION_BPS = COMMISSION_BPS;
