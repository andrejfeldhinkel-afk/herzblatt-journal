/**
 * Tests für Newsletter-Broadcast-Funktionalität.
 *
 * Fokus: sendBroadcastEmail batching + Unsubscribe-Link-Injection (deterministisch
 * ohne echten SendGrid-Call testbar via fetch-Mocking).
 *
 * Die HTTP-Route-Tests sind absichtlich NICHT enthalten — sie würden eine echte
 * Postgres-Verbindung brauchen. Die sendBroadcastEmail-Logik ist der kritische
 * Teil (Batching, per-Empfänger-URL) und hat Unit-Tests ohne DB.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Secrets vor Modul-Import setzen (sendgrid.ts liest ENV at call-time; das
// Unsubscribe-Modul liest ENV bei getUnsubscribeSecret() strict).
// DATABASE_URL ist ein Dummy — sendgrid.ts importiert transitiv db/index.ts,
// welches die Env prüft. Die Tests hier machen KEINE echten DB-Calls
// (sendBroadcastEmail hat keinen DB-Zugriff), deshalb reicht die Stub-URL.
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
process.env.IP_SALT = process.env.IP_SALT || 'test-ip-salt-at-least-16-chars-long-please';
process.env.UNSUBSCRIBE_SECRET = 'test-unsubscribe-secret-please-dont-use-in-prod';
process.env.SENDGRID_API_KEY = 'SG.test-fake-key';
process.env.SENDGRID_FROM_EMAIL = 'test@herzblatt-journal.com';
process.env.PUBLIC_BASE_URL = 'https://test.example.com';

type CapturedRequest = {
  url: string;
  method: string;
  body: any;
  headers: Record<string, string>;
};

function installFetchMock(respond: () => { ok: boolean; status: number; text?: string }) {
  const captured: CapturedRequest[] = [];
  const originalFetch = globalThis.fetch;
  (globalThis as any).fetch = async (url: string, init: RequestInit) => {
    const headers: Record<string, string> = {};
    const h = init?.headers;
    if (h) {
      if (h instanceof Headers) h.forEach((v, k) => { headers[k] = v; });
      else if (Array.isArray(h)) for (const [k, v] of h) headers[k] = v;
      else Object.assign(headers, h);
    }
    let body: any = null;
    if (init?.body) {
      try { body = JSON.parse(String(init.body)); } catch { body = init.body; }
    }
    captured.push({ url: String(url), method: init?.method || 'GET', body, headers });
    const r = respond();
    return new Response(r.text ?? '{}', {
      status: r.status,
      headers: { 'content-type': 'application/json' },
    });
  };
  return {
    captured,
    restore: () => { (globalThis as any).fetch = originalFetch; },
  };
}

// Lazy-import nachdem ENV gesetzt ist.
const { sendBroadcastEmail } = await import('../../lib/sendgrid.js');

test('sendBroadcastEmail: sendet 1 Request pro Empfänger mit eigener Unsubscribe-URL', async () => {
  const mock = installFetchMock(() => ({ ok: true, status: 202 }));
  try {
    const result = await sendBroadcastEmail(
      'Test Subject',
      '<p>Hallo!</p><p>Hier der Link: {{UNSUBSCRIBE_URL}}</p>',
      ['a@example.com', 'b@example.com', 'c@example.com'],
    );
    assert.equal(result.sent, 3, 'sollte 3 Empfänger erfolgreich markieren');
    assert.equal(result.failed, 0);
    assert.equal(mock.captured.length, 3, 'ein Request pro Empfänger');

    // Jede Mail muss an GENAU einen Empfänger gehen (keine Cross-Disclosure).
    for (const req of mock.captured) {
      assert.ok(req.url.endsWith('/mail/send'), 'zielt auf /mail/send');
      assert.equal(req.body.personalizations.length, 1);
      assert.equal(req.body.personalizations[0].to.length, 1);
    }

    // Die Empfänger-Liste in den Requests muss die Input-Liste covern.
    const sentTo = mock.captured.map((r) => r.body.personalizations[0].to[0].email).sort();
    assert.deepEqual(sentTo, ['a@example.com', 'b@example.com', 'c@example.com']);

    // Pro Request MUSS der Unsubscribe-Link den Empfänger-Email enthalten
    // (jede URL ist individuell getokent).
    for (const req of mock.captured) {
      const email = req.body.personalizations[0].to[0].email;
      const htmlContent = req.body.content.find((c: any) => c.type === 'text/html').value;
      const listUnsubHeader = req.body.headers['List-Unsubscribe'];
      assert.ok(
        listUnsubHeader.includes(encodeURIComponent(email)),
        `List-Unsubscribe-Header enthält den Empfänger-Email (${email}): ${listUnsubHeader}`,
      );
      assert.ok(
        htmlContent.includes(encodeURIComponent(email)),
        `HTML-Body enthält die persönliche Unsubscribe-URL für ${email}`,
      );
      assert.ok(
        !htmlContent.includes('{{UNSUBSCRIBE_URL}}'),
        'Platzhalter wurde komplett ersetzt',
      );
    }
  } finally {
    mock.restore();
  }
});

test('sendBroadcastEmail: injiziert Footer wenn kein Marker vorhanden', async () => {
  const mock = installFetchMock(() => ({ ok: true, status: 202 }));
  try {
    const result = await sendBroadcastEmail(
      'Subject',
      '<p>Body ohne Marker</p>',
      ['test@example.com'],
    );
    assert.equal(result.sent, 1);
    assert.equal(mock.captured.length, 1);

    const req = mock.captured[0];
    const htmlContent = req.body.content.find((c: any) => c.type === 'text/html').value;
    // Footer wurde angehängt + Marker durch echte URL ersetzt.
    assert.ok(htmlContent.includes('Abmelden'), 'Footer-Text "Abmelden" ist drin');
    assert.ok(htmlContent.includes('test%40example.com'), 'URL-encoded Email ist drin');
    assert.ok(!htmlContent.includes('{{UNSUBSCRIBE_URL}}'), 'Platzhalter vollständig ersetzt');

    // List-Unsubscribe-Header gesetzt
    assert.ok(req.body.headers['List-Unsubscribe']);
    assert.equal(req.body.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  } finally {
    mock.restore();
  }
});

test('sendBroadcastEmail: zählt Failures korrekt bei SendGrid-Fehlern', async () => {
  let call = 0;
  const mock = installFetchMock(() => {
    call++;
    // Erster OK, zweiter fail mit 400, dritter OK
    if (call === 2) return { ok: false, status: 400, text: 'bad request' };
    return { ok: true, status: 202 };
  });
  try {
    const result = await sendBroadcastEmail(
      'Subject',
      '<p>Test</p>',
      ['a@example.com', 'b@example.com', 'c@example.com'],
    );
    // Promise.allSettled — alle 3 Requests werden abgefeuert, einer schlägt fehl.
    assert.equal(result.sent, 2, '2 erfolgreich');
    assert.equal(result.failed, 1, '1 gescheitert');
    assert.ok(result.errors.length >= 1, 'Fehler-Liste nicht leer');
    assert.ok(result.errors[0].includes('400'), 'Fehler-Message enthält HTTP-Status');
  } finally {
    mock.restore();
  }
});

test('sendBroadcastEmail: leere Empfängerliste → early return', async () => {
  const mock = installFetchMock(() => ({ ok: true, status: 202 }));
  try {
    const result = await sendBroadcastEmail('Subject', '<p>body</p>', []);
    assert.equal(result.sent, 0);
    assert.equal(result.failed, 0);
    assert.equal(mock.captured.length, 0, 'kein SendGrid-Call');
  } finally {
    mock.restore();
  }
});

test('sendBroadcastEmail: ohne SENDGRID_API_KEY → skipped=true', async () => {
  const original = process.env.SENDGRID_API_KEY;
  delete process.env.SENDGRID_API_KEY;
  const mock = installFetchMock(() => ({ ok: true, status: 202 }));
  try {
    const result = await sendBroadcastEmail('Subject', '<p>body</p>', ['x@y.z']);
    assert.equal(result.skipped, true);
    assert.equal(result.sent, 0);
    assert.equal(mock.captured.length, 0);
  } finally {
    process.env.SENDGRID_API_KEY = original;
    mock.restore();
  }
});
