/**
 * CSRF-Token Unit-Tests — verifiziert Double-Submit + HMAC-Signing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Test-Secret BEVOR wir das Modul importieren (getSecret() liest env)
process.env.CSRF_SECRET = 'test-secret-at-least-32-chars-long-yes';

const {
  generateCsrfToken,
  verifyCsrfToken,
  buildCsrfCookie,
} = await import('./csrf.js');

test('generateCsrfToken produces <random>.<hmac> format', () => {
  const t = generateCsrfToken();
  assert.equal(typeof t, 'string');
  const parts = t.split('.');
  assert.equal(parts.length, 2);
  assert.ok(parts[0].length > 20);
  assert.ok(parts[1].length > 20);
});

test('tokens round-trip via cookie + header', () => {
  const token = generateCsrfToken();
  const cookieHeader = `other=foo; ${buildCsrfCookie(token).split(';')[0]}`;
  const ok = verifyCsrfToken({
    cookieHeader,
    headerToken: token,
  });
  assert.equal(ok, true);
});

test('mismatched header token rejected', () => {
  const a = generateCsrfToken();
  const b = generateCsrfToken();
  const cookieHeader = buildCsrfCookie(a).split(';')[0];
  assert.equal(verifyCsrfToken({ cookieHeader, headerToken: b }), false);
});

test('missing header rejected', () => {
  const token = generateCsrfToken();
  const cookieHeader = buildCsrfCookie(token).split(';')[0];
  assert.equal(verifyCsrfToken({ cookieHeader, headerToken: '' }), false);
  assert.equal(verifyCsrfToken({ cookieHeader, headerToken: null }), false);
});

test('missing cookie rejected', () => {
  assert.equal(
    verifyCsrfToken({ cookieHeader: null, headerToken: 'anything' }),
    false,
  );
});

test('tampered HMAC part rejected (forged token)', () => {
  const token = generateCsrfToken();
  const [random] = token.split('.');
  const forged = random + '.' + 'A'.repeat(43);
  const cookieHeader = `hz_csrf=${forged}`;
  assert.equal(
    verifyCsrfToken({ cookieHeader, headerToken: forged }),
    false,
  );
});
