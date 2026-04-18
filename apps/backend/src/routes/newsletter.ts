import { Hono } from 'hono';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { getClientIp, hashIp } from '../lib/crypto.js';
import { allowRequest } from '../lib/rate-limit.js';

const app = new Hono();

// Etwas strikteres Rate-Limit für Newsletter: 10 pro Stunde pro IP
function allowNewsletter(ipHash: string): boolean {
  return allowRequest('nl:' + ipHash, 10, 60 * 60_000);
}

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

const ALLOWED_SOURCES = new Set([
  'newsletter-footer',
  'newsletter-inline',
  'ebook-waitlist',
  'quiz-result',
  'exit-intent',
  'blog-cta',
  'unknown',
]);

const bodySchema = z.object({
  email: z.string().min(1).max(254),
  source: z.string().max(40).optional(),
});

app.post('/', async (c) => {
  const ip = getClientIp(c.req.raw, c.req.raw.headers);
  const ipHashVal = hashIp(ip);

  if (!allowNewsletter(ipHashVal)) {
    return c.json({ success: false, message: 'Zu viele Versuche. Bitte später wieder.' }, 429);
  }

  const ct = c.req.header('content-type') || '';
  if (!ct.includes('application/json')) {
    return c.json({ success: false, message: 'Invalid content type.' }, 400);
  }

  let body: unknown;
  try { body = await c.req.json(); }
  catch { return c.json({ success: false, message: 'Ungültige Daten.' }, 400); }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, message: 'Bitte gib eine gültige E-Mail-Adresse ein.' }, 400);
  }

  const email = parsed.data.email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(email)) {
    return c.json({ success: false, message: 'Bitte gib eine gültige E-Mail-Adresse ein.' }, 400);
  }

  const rawSource = parsed.data.source?.trim() || '';
  const source = ALLOWED_SOURCES.has(rawSource) ? rawSource : 'unknown';

  const ua = (c.req.header('user-agent') || '').slice(0, 200);

  try {
    // Existierende Email? (UNIQUE-Check bevor Insert, damit klare UX-Message)
    const existing = await db
      .select({ id: schema.subscribers.id })
      .from(schema.subscribers)
      .where(eq(schema.subscribers.email, email))
      .limit(1);

    if (existing.length > 0) {
      return c.json({ success: true, message: 'Du bist bereits angemeldet!' });
    }

    await db.insert(schema.subscribers).values({
      email,
      source,
      ipHash: ipHashVal,
      userAgent: ua,
    });

    return c.json({
      success: true,
      message: 'Willkommen! Du erhältst bald unsere besten Dating-Tipps.',
    });
  } catch (err) {
    console.error('[newsletter] db error:', err);
    return c.json({ success: false, message: 'Ein Fehler ist aufgetreten.' }, 500);
  }
});

export default app;
