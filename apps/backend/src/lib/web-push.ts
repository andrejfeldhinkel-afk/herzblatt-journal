/**
 * Web-Push-Helper — minimal VAPID + aes128gcm-Wrapper auf Basis der WebCrypto-API.
 *
 * Wir verwenden bewusst KEIN `web-push`-NPM-Package, um Bundle-Größe klein
 * und Dependency-Surface minimal zu halten. Alles läuft mit Node 20+ native
 * crypto.webcrypto (keine zusätzliche Installation nötig).
 *
 * Env-Vars (Railway):
 *   VAPID_PUBLIC_KEY   — Base64URL der P-256-Public-Key-Rohbytes (65 Bytes)
 *   VAPID_PRIVATE_KEY  — Base64URL der P-256-Private-Key-Rohbytes (32 Bytes)
 *   VAPID_SUBJECT      — mailto: oder https://-URL, z.B. 'mailto:andrej@leadpartner.net'
 *
 * Generieren mit: `pnpm --filter @herzblatt/backend exec tsx scripts/generate-vapid.ts`
 * oder: `npx web-push generate-vapid-keys`
 */
import { webcrypto } from 'node:crypto';

// webcrypto exposes the full SubtleCrypto API on Node 20+; cast to `any` so we
// don't need the DOM lib types in tsconfig.
const crypto: {
  subtle: any;
  getRandomValues: <T extends ArrayBufferView>(arr: T) => T;
} = webcrypto as any;
type CryptoKey = any;
type JsonWebKey = {
  kty: string; crv?: string; d?: string; x?: string; y?: string; ext?: boolean;
};

export interface PushSubscriptionShape {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  image?: string;
  tag?: string;
  renotify?: boolean;
  requireInteraction?: boolean;
  id?: string | number;
}

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export function loadVapidConfig(): VapidConfig | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:andrej@leadpartner.net';
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

// ─── Base64URL Helpers ──────────────────────────────────────────────
export function b64UrlToBuf(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(Buffer.from(b64, 'base64'));
}

export function bufToB64Url(buf: Uint8Array): string {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ─── VAPID JWT Signing ──────────────────────────────────────────────
async function importVapidPrivateKey(privateKeyB64: string): Promise<CryptoKey> {
  const raw = b64UrlToBuf(privateKeyB64);
  // Raw 32-byte P-256 private key → JWK
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    d: bufToB64Url(raw),
    x: '',
    y: '',
    ext: true,
  };
  // We need the public key too to build JWK. Derive from private.
  const publicKey = await derivePublicKeyFromPrivate(raw);
  jwk.x = bufToB64Url(publicKey.slice(1, 33));
  jwk.y = bufToB64Url(publicKey.slice(33, 65));
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

async function derivePublicKeyFromPrivate(rawPrivate: Uint8Array): Promise<Uint8Array> {
  // Use pkcs8 import to extract public key bytes.
  // Build a minimal PKCS#8 wrapper for the raw 32-byte secret.
  const pkcs8 = buildPkcs8ForP256(rawPrivate);
  const key = await crypto.subtle.importKey('pkcs8', pkcs8, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
  const jwk = await crypto.subtle.exportKey('jwk', key);
  if (!jwk.x || !jwk.y) throw new Error('cannot derive public key');
  const x = b64UrlToBuf(jwk.x);
  const y = b64UrlToBuf(jwk.y);
  const out = new Uint8Array(65);
  out[0] = 0x04;
  out.set(x, 1);
  out.set(y, 33);
  return out;
}

function buildPkcs8ForP256(rawPriv: Uint8Array): ArrayBuffer {
  // ASN.1 DER-encoded PKCS#8 for a 32-byte P-256 private key, without the
  // optional public-key tag. Layout is static — we only swap in the 32 bytes.
  const prefix = new Uint8Array([
    0x30, 0x41, 0x02, 0x01, 0x00, 0x30, 0x13, 0x06,
    0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
    0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03,
    0x01, 0x07, 0x04, 0x27, 0x30, 0x25, 0x02, 0x01,
    0x01, 0x04, 0x20,
  ]);
  const buf = new Uint8Array(prefix.length + rawPriv.length);
  buf.set(prefix, 0);
  buf.set(rawPriv, prefix.length);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

async function signJwt(subject: string, audience: string, privateKeyB64: string): Promise<string> {
  const header = { typ: 'JWT', alg: 'ES256' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: audience,
    exp: now + 12 * 60 * 60, // 12h — spec max is 24h
    sub: subject,
  };
  const encHeader = bufToB64Url(new TextEncoder().encode(JSON.stringify(header)));
  const encPayload = bufToB64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signingInput = `${encHeader}.${encPayload}`;
  const privKey = await importVapidPrivateKey(privateKeyB64);
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      privKey,
      new TextEncoder().encode(signingInput),
    ),
  );
  return `${signingInput}.${bufToB64Url(sig)}`;
}

// ─── Payload Encryption (aes128gcm, RFC 8291) ──────────────────────
async function encryptPayload(
  payload: Uint8Array,
  userPublicKeyB64: string,
  userAuthB64: string,
): Promise<{ body: Uint8Array; serverPublicKey: Uint8Array }> {
  const userPub = b64UrlToBuf(userPublicKeyB64);
  const userAuth = b64UrlToBuf(userAuthB64);
  // Generate ephemeral EC key pair.
  const ephemeral = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  );
  const serverPublicJwk = await crypto.subtle.exportKey('jwk', ephemeral.publicKey);
  const serverPublicRaw = new Uint8Array(65);
  serverPublicRaw[0] = 0x04;
  serverPublicRaw.set(b64UrlToBuf(serverPublicJwk.x!), 1);
  serverPublicRaw.set(b64UrlToBuf(serverPublicJwk.y!), 33);

  // Import user's public key.
  const userKey = await crypto.subtle.importKey(
    'raw',
    userPub,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    [],
  );

  // ECDH shared secret.
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: userKey },
    ephemeral.privateKey,
    256,
  );
  const ecdhSecret = new Uint8Array(sharedBits);

  // HKDF-extract with auth secret, then expand to PRK (aes128gcm info).
  const authInfo = concatBuffers(new TextEncoder().encode('WebPush: info\0'), userPub, serverPublicRaw);
  const prk = await hkdf(userAuth, ecdhSecret, authInfo, 32);

  // Generate salt (16 random bytes).
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Derive CEK (16 bytes) and nonce (12 bytes).
  const cek = await hkdf(salt, prk, new TextEncoder().encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, prk, new TextEncoder().encode('Content-Encoding: nonce\0'), 12);

  // Pad payload with a delimiter (0x02) + zeros — use minimum (1-byte padding).
  const padded = new Uint8Array(payload.length + 1);
  padded.set(payload, 0);
  padded[payload.length] = 0x02;

  // Encrypt with AES-128-GCM.
  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, padded),
  );

  // Build aes128gcm content-coding header: salt(16) | rs(4, big-endian) | idlen(1) | keyid
  // keyid = server public key (65 bytes).
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096, false);
  const header = new Uint8Array(16 + 4 + 1 + 65);
  header.set(salt, 0);
  header.set(rs, 16);
  header[20] = 65;
  header.set(serverPublicRaw, 21);

  const body = concatBuffers(header, ciphertext);
  return { body, serverPublicKey: serverPublicRaw };
}

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, { name: 'HKDF' }, false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

function concatBuffers(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

// ─── Send a Push Notification ──────────────────────────────────────
export interface PushSendResult {
  status: number;
  ok: boolean;
  body?: string;
  /** True if the subscription is gone (404/410) and should be deleted/disabled. */
  gone: boolean;
}

export async function sendPush(
  vapid: VapidConfig,
  sub: PushSubscriptionShape,
  payload: PushPayload,
  ttlSeconds: number = 86400,
): Promise<PushSendResult> {
  const audience = new URL(sub.endpoint).origin;
  const jwt = await signJwt(vapid.subject, audience, vapid.privateKey);

  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const { body } = await encryptPayload(payloadBytes, sub.keys.p256dh, sub.keys.auth);

  const headers: Record<string, string> = {
    'Content-Type': 'application/octet-stream',
    'Content-Encoding': 'aes128gcm',
    TTL: String(ttlSeconds),
    Authorization: `vapid t=${jwt},k=${vapid.publicKey}`,
  };

  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers,
    body,
  });

  let text: string | undefined;
  if (!res.ok) {
    try { text = await res.text(); } catch { /* noop */ }
  }

  return {
    status: res.status,
    ok: res.ok,
    body: text,
    gone: res.status === 404 || res.status === 410,
  };
}
