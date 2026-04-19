/**
 * POST /api/checkout/micropayment
 *
 * Erstellt eine signierte Micropayment-Bezahlfenster-URL.
 *
 * Input (JSON body oder query params):
 *   { method: "sofort" | "paysafe", email?: "user@example.com" }
 *
 * Email ist OPTIONAL — Micropayment fragt die Email im eigenen Bezahlfenster
 * ab (E-Mail-Abfrage-Checkbox ist im Projekt aktiv). Wenn email nicht
 * übergeben wird, wird mp_user_email nicht als Param gesetzt und fließt auch
 * nicht in die Signatur ein.
 *
 * Output:
 *   { url: "https://<domain>.micropayment.de/public/main/event/?..." }
 *
 * Signing-Scheme (laut dev.micropayment.de):
 *   1. Alle Parameter alphabetisch nach Key sortieren
 *   2. Als key1value1key2value2... konkatenieren (OHNE '=' oder '&')
 *   3. AccessKey anhängen
 *   4. MD5 über den UTF-8 String → hex lowercase = accessKey-Query-Param
 *
 * Der Client ruft nur die URL ab, die Bezahlung selbst erfolgt auf der
 * Micropayment-Seite. Bestätigung kommt via Webhook zurück (→ micropayment-webhook.ts).
 *
 * ENV:
 *   MICROPAYMENT_PROJECT_KEY — Projekt-Schlüssel
 *   MICROPAYMENT_ACCESS_KEY  — Access-Key (signing secret)
 *   MICROPAYMENT_TEST_MODE   — '1' für Testmode (default '1')
 */
import { Hono } from 'hono';
import { createHash, randomUUID } from 'node:crypto';

const app = new Hono();

const ALLOWED_METHODS = new Set(['sofort', 'paysafe']);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Micropayment-Signatur bauen.
 * Sortiert Keys alphabetisch, konkateniert key1value1key2value2..., hängt
 * AccessKey an, MD5 hex lowercase zurück.
 */
function buildMicropaymentSignature(
  params: Record<string, string>,
  accessKey: string,
): string {
  const keys = Object.keys(params).sort();
  const concatenated = keys.map((k) => `${k}${params[k]}`).join('') + accessKey;
  return createHash('md5').update(concatenated, 'utf8').digest('hex').toLowerCase();
}

app.post('/', async (c) => {
  try {
    // Input kann JSON body oder query params sein
    let method = '';
    let email = '';

    const ct = c.req.header('content-type') || '';
    if (ct.includes('application/json')) {
      try {
        const body = (await c.req.json()) as { method?: unknown; email?: unknown };
        method = String(body.method || '').toLowerCase().trim();
        email = String(body.email || '').toLowerCase().trim();
      } catch {
        // Body leer oder kein valid JSON → fallback zu query params
      }
    }

    if (!method) method = String(c.req.query('method') || '').toLowerCase().trim();
    if (!email) email = String(c.req.query('email') || '').toLowerCase().trim();

    // Validation — email ist optional, wird nur validiert wenn vorhanden
    if (!ALLOWED_METHODS.has(method)) {
      return c.json({ error: 'Invalid method. Must be "sofort" or "paysafe".' }, 400);
    }
    if (email && !EMAIL_REGEX.test(email)) {
      return c.json({ error: 'Invalid email format.' }, 400);
    }

    // Env-Vars lesen
    const projectKey = process.env.MICROPAYMENT_PROJECT_KEY || '';
    const accessKey = process.env.MICROPAYMENT_ACCESS_KEY || '';
    const testMode = process.env.MICROPAYMENT_TEST_MODE || '1';

    if (!projectKey || !accessKey) {
      console.error('[micropayment-checkout] MICROPAYMENT_PROJECT_KEY oder MICROPAYMENT_ACCESS_KEY fehlt');
      return c.json({ error: 'Payment provider not configured.' }, 500);
    }

    // Params für die Bezahlfenster-URL bauen
    // mp_user_email nur setzen wenn vorhanden — sonst fragt Micropayment
    // die Email im Bezahlfenster ab (und Param fließt nicht ins Signing ein)
    const params: Record<string, string> = {
      project: projectKey,
      amount: '8999',
      currency: 'EUR',
      testMode,
      title: 'Herzblatt-Methode',
      freeParam: randomUUID(),
    };
    if (email) {
      params.mp_user_email = email;
    }

    // Signatur (MD5 über sortierte key-value-Konkatenation + AccessKey)
    const signature = buildMicropaymentSignature(params, accessKey);

    // Domain wählen nach Zahlmethode
    const domain = method === 'sofort'
      ? 'sofort.micropayment.de'
      : 'paysafecard.micropayment.de';

    // URL zusammenbauen — accessKey kommt als Query-Param dazu
    const qs = new URLSearchParams({
      ...params,
      accessKey: signature,
    });

    const url = `https://${domain}/public/main/event/?${qs.toString()}`;

    console.log(`[micropayment-checkout] URL generated für ${email || '(no-email)'} (${method}), freeParam=${params.freeParam}`);

    return c.json({ url }, 200);
  } catch (err) {
    console.error('[micropayment-checkout] unexpected error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// GET für Health-/Setup-Check
app.get('/', (c) => {
  return c.json({
    ok: true,
    info: 'Micropayment checkout URL builder. POST { method, email? } to get a signed payment URL. Email is optional — Micropayment asks for it in its own payment window.',
    configured: !!process.env.MICROPAYMENT_PROJECT_KEY && !!process.env.MICROPAYMENT_ACCESS_KEY,
    testMode: process.env.MICROPAYMENT_TEST_MODE || '1',
  });
});

export default app;
