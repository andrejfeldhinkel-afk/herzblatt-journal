/**
 * GET/POST /unsubscribe
 *
 * Public-Endpoint für Abmeldung aus dem Newsletter.
 * Wird in Welcome-/Newsletter-Mails verlinkt.
 *
 * Sicherheits-Modell:
 *   Token = HMAC-SHA256(email, UNSUBSCRIBE_SECRET).slice(0, 32)
 *   Damit kann nur der Mail-Empfänger sich selbst abmelden
 *   (ohne den Secret kann niemand Tokens für fremde Mails bauen).
 *
 *   **Fail-closed:** Vor April 2026 fiel der Secret-Lookup auf `IP_SALT`
 *   zurück und dann auf den hardcoded String
 *   "herzblatt-unsubscribe-fallback-secret". Wenn in Railway beide Envs
 *   fehlten, konnte jeder Internetnutzer mit drei Zeilen Code einen
 *   gültigen Token für beliebige Mails berechnen und die gesamte
 *   Subscriber-Liste en masse abmelden.
 *   Jetzt: nur `UNSUBSCRIBE_SECRET` wird akzeptiert, Minimum 16 Zeichen.
 *   Fehlt er, wirft der Handler 500 + Sentry-Capture — kein Fallback.
 *
 * URL-Format:
 *   https://.../unsubscribe?email=x@y.z&token=HMACxxxxx
 *
 * Query:
 *   email — URL-encoded
 *   token — HMAC
 *
 * Response:
 *   GET → HTML-Page mit Bestätigung oder Formular
 *   POST → JSON ok/error
 */
import { Hono } from 'hono';
import { createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

const app = new Hono();

const MIN_UNSUBSCRIBE_SECRET_LENGTH = 16;

/**
 * Secret holen — strict: nur `UNSUBSCRIBE_SECRET`, kein Fallback-Chain.
 * Wirft wenn nicht gesetzt oder zu kurz. Der Aufrufer muss den Throw
 * fangen und dem User einen 500-er zurückgeben.
 */
function getUnsubscribeSecret(): string {
  const secret = process.env.UNSUBSCRIBE_SECRET;
  if (!secret || secret.length < MIN_UNSUBSCRIBE_SECRET_LENGTH) {
    throw new Error(
      `UNSUBSCRIBE_SECRET env var missing or too short (min ${MIN_UNSUBSCRIBE_SECRET_LENGTH} chars) — refusing to issue or verify tokens`,
    );
  }
  return secret;
}

/**
 * Boot-time Check: wird von index.ts vor dem `serve()`-Start aufgerufen.
 * Scheitert laut statt silent mit einem Fallback-Default zu starten.
 */
export function assertUnsubscribeSecretConfigured(): void {
  const secret = process.env.UNSUBSCRIBE_SECRET;
  if (!secret || secret.length < MIN_UNSUBSCRIBE_SECRET_LENGTH) {
    throw new Error(
      `UNSUBSCRIBE_SECRET env var missing or too short (min ${MIN_UNSUBSCRIBE_SECRET_LENGTH} chars) — refusing to boot`,
    );
  }
}

export function buildUnsubscribeToken(email: string): string {
  const secret = getUnsubscribeSecret();
  return createHmac('sha256', secret)
    .update(email.toLowerCase().trim())
    .digest('hex')
    .slice(0, 32);
}

/**
 * Gibt `null` zurück wenn das Secret nicht konfiguriert ist — der Aufrufer
 * muss dann einen 500 rausgeben. So trennen wir "ungültiger Token" (400)
 * von "Server-Mis-Konfiguration" (500) sauber.
 */
function verifyUnsubscribeToken(email: string, token: string): boolean | null {
  if (!email || !token) return false;
  let expected: string;
  try {
    expected = buildUnsubscribeToken(email);
  } catch (err) {
    console.error('[unsubscribe] secret-config error:', err);
    return null;
  }
  // Timing-safe compare
  if (expected.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  }
  return diff === 0;
}

async function doUnsubscribe(email: string): Promise<{ updated: number }> {
  const result = await db
    .update(schema.subscribers)
    .set({ unsubscribedAt: new Date() })
    .where(eq(schema.subscribers.email, email))
    .returning({ id: schema.subscribers.id });
  return { updated: result.length };
}

app.get('/', async (c) => {
  const email = (c.req.query('email') || '').toLowerCase().trim();
  const token = (c.req.query('token') || '').trim();

  const verdict = verifyUnsubscribeToken(email, token);
  if (verdict === null) {
    return c.html(renderPage({
      ok: false,
      title: 'Fehler',
      message: 'Der Abmelde-Service ist nicht korrekt konfiguriert. Bitte schreibe eine Mail an support@herzblatt-journal.com.',
    }), 500);
  }
  if (!email || !token || !verdict) {
    return c.html(renderPage({
      ok: false,
      title: 'Ungültiger Link',
      message: 'Der Abmelde-Link ist nicht gültig oder abgelaufen.',
    }), 400);
  }

  try {
    const { updated } = await doUnsubscribe(email);
    if (updated === 0) {
      return c.html(renderPage({
        ok: true,
        title: 'Bereits abgemeldet',
        message: `Die Adresse ${email} ist nicht (mehr) in unserer Liste.`,
      }));
    }
    return c.html(renderPage({
      ok: true,
      title: 'Abgemeldet',
      message: `Du bist erfolgreich abgemeldet: ${email}. Du erhältst keine weiteren Mails.`,
    }));
  } catch (err) {
    console.error('[unsubscribe] db error:', err);
    return c.html(renderPage({
      ok: false,
      title: 'Fehler',
      message: 'Ein Fehler ist aufgetreten. Bitte schreibe eine Mail an support@herzblatt-journal.com.',
    }), 500);
  }
});

app.post('/', async (c) => {
  const ct = c.req.header('content-type') || '';
  let email = '';
  let token = '';
  if (ct.includes('application/json')) {
    try {
      const body = (await c.req.json()) as any;
      email = String(body.email || '').toLowerCase().trim();
      token = String(body.token || '').trim();
    } catch { /* noop */ }
  } else {
    const form = await c.req.parseBody();
    email = String(form.email || '').toLowerCase().trim();
    token = String(form.token || '').trim();
  }

  const verdict = verifyUnsubscribeToken(email, token);
  if (verdict === null) {
    return c.json({ ok: false, error: 'unsubscribe-not-configured' }, 500);
  }
  if (!email || !token || !verdict) {
    return c.json({ ok: false, error: 'invalid token' }, 400);
  }

  try {
    const { updated } = await doUnsubscribe(email);
    return c.json({ ok: true, updated, already_unsubscribed: updated === 0 });
  } catch (err) {
    return c.json({ ok: false, error: String(err) }, 500);
  }
});

function renderPage(opts: { ok: boolean; title: string; message: string }): string {
  const color = opts.ok ? '#16a34a' : '#e11d48';
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${opts.title} · Herzblatt Journal</title>
  <style>
    body { font-family: Georgia, serif; margin: 0; padding: 2rem 1rem; background: #fafaf9; color: #1f2937; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .card { max-width: 480px; background: white; padding: 2.5rem 2rem; border-radius: 1rem; box-shadow: 0 4px 20px rgba(0,0,0,0.05); text-align: center; }
    h1 { font-size: 1.6rem; margin: 0 0 1rem 0; color: ${color}; }
    p { font-size: 1rem; line-height: 1.5; color: #4b5563; }
    a { color: #e11d48; text-decoration: none; display: inline-block; margin-top: 1.5rem; font-weight: 600; }
  </style>
</head>
<body>
  <main class="card">
    <h1>${opts.title}</h1>
    <p>${opts.message}</p>
    <a href="https://herzblatt-journal.com/">← zurück zu Herzblatt Journal</a>
  </main>
</body>
</html>`;
}

export default app;
