/**
 * Unit-Tests für verifyDigistoreSignature().
 *
 * Läuft mit Node's built-in test runner (Node 22+):
 *   node --test apps/backend/dist/routes/digistore-ipn.test.js
 * Oder direkt via tsx:
 *   npx tsx --test apps/backend/src/routes/digistore-ipn.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// Dupliziert die Logik aus routes/digistore-ipn.ts.
// (Eine sauberere Lösung wäre Extract in lib/, aber für einen Test-Touch OK.)
function verifyDigistoreSignature(params: Record<string, string>, passphrase: string): boolean {
  const { sha_sign, ...rest } = params;
  if (!sha_sign || !passphrase) return false;

  const keys = Object.keys(rest)
    .filter((k) => rest[k] !== undefined && rest[k] !== null && String(rest[k]).length > 0)
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

  const concatenated = keys.map((k) => `${k}=${rest[k]}`).join('') + passphrase;
  const hash = createHash('sha512').update(concatenated, 'utf8').digest('hex').toUpperCase();

  return hash === String(sha_sign).toUpperCase();
}

/** Helper: baut einen valid-signed payload für Tests. */
function buildSigned(params: Record<string, string>, passphrase: string): Record<string, string> {
  const keys = Object.keys(params)
    .filter((k) => String(params[k]).length > 0)
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const concat = keys.map((k) => `${k}=${params[k]}`).join('') + passphrase;
  const sig = createHash('sha512').update(concat, 'utf8').digest('hex').toUpperCase();
  return { ...params, sha_sign: sig };
}

const PASS = 'TESTPASSPHRASE-123';

test('verifyDigistoreSignature: valid payload returns true', () => {
  const payload = buildSigned(
    {
      event: 'on_payment',
      email: 'buyer@example.com',
      order_id: '42-4711',
      product_id: 'herzblatt-ebook',
      amount: '89.99',
      currency: 'EUR',
    },
    PASS,
  );
  assert.equal(verifyDigistoreSignature(payload, PASS), true);
});

test('verifyDigistoreSignature: wrong passphrase returns false', () => {
  const payload = buildSigned({ event: 'on_payment', email: 'x@y.z' }, PASS);
  assert.equal(verifyDigistoreSignature(payload, 'OTHER-PASS'), false);
});

test('verifyDigistoreSignature: tampered amount fails', () => {
  const payload = buildSigned({ event: 'on_payment', email: 'x@y.z', amount: '89.99' }, PASS);
  payload.amount = '0.01'; // tamper!
  assert.equal(verifyDigistoreSignature(payload, PASS), false);
});

test('verifyDigistoreSignature: missing sha_sign returns false', () => {
  const payload: Record<string, string> = {
    event: 'on_payment',
    email: 'x@y.z',
    // sha_sign fehlt
  };
  assert.equal(verifyDigistoreSignature(payload, PASS), false);
});

test('verifyDigistoreSignature: empty passphrase returns false', () => {
  const payload = buildSigned({ event: 'on_payment', email: 'x@y.z' }, PASS);
  assert.equal(verifyDigistoreSignature(payload, ''), false);
});

test('verifyDigistoreSignature: case-insensitive key-sort', () => {
  // Das ist der Test für den case-insensitive compare in der sort().
  // Mixed-case keys sollen in stable order sein.
  const mixed = {
    Email: 'x@y.z',
    amount: '10',
    Event: 'on_payment',
    order_id: 'abc',
  };
  const payload = buildSigned(mixed, PASS);
  assert.equal(verifyDigistoreSignature(payload, PASS), true);
});

test('verifyDigistoreSignature: empty-string params are skipped (both sides)', () => {
  // Params with empty values werden NICHT in den Hash genommen.
  const base = {
    event: 'on_payment',
    email: 'x@y.z',
    note: '',           // leer — wird skipped
    order_id: 'abc',
  };
  const payload = buildSigned(base, PASS);
  assert.equal(verifyDigistoreSignature(payload, PASS), true);
});

test('verifyDigistoreSignature: test-event with minimal params', () => {
  const payload = buildSigned({ event: 'test' }, PASS);
  assert.equal(verifyDigistoreSignature(payload, PASS), true);
});

test('verifyDigistoreSignature: extra unknown params are accepted if in sig', () => {
  const payload = buildSigned(
    {
      event: 'on_payment',
      email: 'x@y.z',
      custom_field_1: 'anything',
      customer_country: 'DE',
    },
    PASS,
  );
  assert.equal(verifyDigistoreSignature(payload, PASS), true);
});

test('verifyDigistoreSignature: added param after signing fails', () => {
  const payload = buildSigned({ event: 'on_payment', email: 'x@y.z' }, PASS);
  payload.injected_evil_field = 'lol';  // nach sig eingefügt
  assert.equal(verifyDigistoreSignature(payload, PASS), false);
});
