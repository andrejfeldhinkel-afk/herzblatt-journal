/**
 * Unit-Tests für crypto-Helper.
 *
 * Läuft via: pnpm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashIp, getClientIp } from './crypto.js';

// Für deterministische Tests immer gleiches Salt setzen.
// MUSS mindestens 16 Zeichen sein (fail-closed-Guard in hashIp()).
process.env.IP_SALT = 'fixed-test-salt-0123456789';

test('hashIp: returns 32-char hex', () => {
  const h = hashIp('127.0.0.1');
  assert.equal(h.length, 32);
  assert.match(h, /^[a-f0-9]{32}$/);
});

test('hashIp: deterministic (same input → same output)', () => {
  assert.equal(hashIp('1.2.3.4'), hashIp('1.2.3.4'));
});

test('hashIp: different IPs → different hashes', () => {
  assert.notEqual(hashIp('1.2.3.4'), hashIp('1.2.3.5'));
});

test('hashIp: salt matters (different salt → different hash)', () => {
  const original = process.env.IP_SALT;
  process.env.IP_SALT = 'salt-a-padded-to-min-len';
  const hA = hashIp('10.0.0.1');
  process.env.IP_SALT = 'salt-b-padded-to-min-len';
  const hB = hashIp('10.0.0.1');
  process.env.IP_SALT = original;
  assert.notEqual(hA, hB);
});

test('hashIp: throws when IP_SALT missing', () => {
  const original = process.env.IP_SALT;
  delete process.env.IP_SALT;
  assert.throws(() => hashIp('1.2.3.4'), /IP_SALT/i);
  process.env.IP_SALT = original;
});

test('hashIp: throws when IP_SALT too short', () => {
  const original = process.env.IP_SALT;
  process.env.IP_SALT = 'too-short';
  assert.throws(() => hashIp('1.2.3.4'), /IP_SALT/i);
  process.env.IP_SALT = original;
});

test('hashIp: IPv6 works too', () => {
  const h = hashIp('2001:db8::1');
  assert.equal(h.length, 32);
});

test('hashIp: empty string returns deterministic hash', () => {
  // Auch ein leerer Input (defensiv-branch) sollte hashbar sein
  const h = hashIp('');
  assert.equal(h.length, 32);
});

test('getClientIp: x-forwarded-for with single IP', () => {
  const headers = new Headers({ 'x-forwarded-for': '1.2.3.4' });
  const ip = getClientIp(new Request('https://x.test/'), headers);
  assert.equal(ip, '1.2.3.4');
});

test('getClientIp: x-forwarded-for with chain → picks first', () => {
  const headers = new Headers({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1, 192.168.1.1' });
  const ip = getClientIp(new Request('https://x.test/'), headers);
  assert.equal(ip, '1.2.3.4');
});

test('getClientIp: x-forwarded-for with spaces → trimmed', () => {
  const headers = new Headers({ 'x-forwarded-for': '  1.2.3.4  ' });
  const ip = getClientIp(new Request('https://x.test/'), headers);
  assert.equal(ip, '1.2.3.4');
});

test('getClientIp: falls back to x-real-ip', () => {
  const headers = new Headers({ 'x-real-ip': '5.6.7.8' });
  const ip = getClientIp(new Request('https://x.test/'), headers);
  assert.equal(ip, '5.6.7.8');
});

test('getClientIp: x-forwarded-for takes precedence over x-real-ip', () => {
  const headers = new Headers({
    'x-forwarded-for': '1.2.3.4',
    'x-real-ip': '5.6.7.8',
  });
  const ip = getClientIp(new Request('https://x.test/'), headers);
  assert.equal(ip, '1.2.3.4');
});

test('getClientIp: no header returns "unknown"', () => {
  const headers = new Headers();
  const ip = getClientIp(new Request('https://x.test/'), headers);
  assert.equal(ip, 'unknown');
});
