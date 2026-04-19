import { Hono } from 'hono';
import { z } from 'zod';
import { db, schema } from '../db/index.js';
import { getClientIp, hashIp } from '../lib/crypto.js';
import { allowRequest } from '../lib/rate-limit.js';

const app = new Hono();

const REGISTER_API_URL = process.env.REGISTER_API_URL || 'https://be.xloves.com/api/auth/register';

// 10 Register-Versuche pro Stunde pro IP
function allowRegister(ipHash: string): boolean {
  return allowRequest('reg:' + ipHash, 10, 60 * 60_000);
}

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

const bodySchema = z.object({
  email: z.string().min(1).max(254),
  username: z.string().min(3).max(50),
  password: z.string().min(6).max(128),
  gender: z.string().max(20).optional(),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  source: z.string().max(40).optional(),
});

app.post('/', async (c) => {
  const ip = getClientIp(c.req.raw, c.req.raw.headers);
  if (!allowRegister(hashIp(ip))) {
    return c.json({ message: 'Zu viele Versuche. Bitte später wieder.' }, 429);
  }

  const ct = c.req.header('content-type') || '';
  if (!ct.includes('application/json')) {
    return c.json({ message: 'Invalid content type.' }, 400);
  }

  let body: any;
  try { body = await c.req.json(); }
  catch { return c.json({ message: 'Ungültige Daten.' }, 400); }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    if (first?.path[0] === 'email') return c.json({ message: 'Ungültige E-Mail-Adresse.' }, 400);
    if (first?.path[0] === 'username') return c.json({ message: 'Benutzername muss mindestens 3 Zeichen lang sein.' }, 400);
    if (first?.path[0] === 'password') return c.json({ message: 'Passwort muss mindestens 6 Zeichen lang sein.' }, 400);
    return c.json({ message: 'Ungültige Daten.' }, 400);
  }

  const email = parsed.data.email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(email)) {
    return c.json({ message: 'Ungültige E-Mail-Adresse.' }, 400);
  }

  // Nur sanitized Felder an xLoves forwarden — kein raw body passthrough
  const forward: Record<string, string> = {
    email,
    username: parsed.data.username,
    password: parsed.data.password,
  };
  if (parsed.data.gender) forward.gender = parsed.data.gender;
  if (parsed.data.birthday) forward.birthday = parsed.data.birthday;

  try {
    const response = await fetch(REGISTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(forward),
    });

    let data: any;
    try { data = await response.json(); }
    catch { data = { message: 'Upstream returned non-JSON' }; }

    // Nur bei Erfolg lokal tracken — Fehler beim Tracking dürfen Response nicht blockieren.
    // onConflictDoNothing: bei Duplikat-Email (UNIQUE-Index) keine neue Row,
    // Response trotzdem ok. Verhindert aufgeblähte KPIs durch Doppel-Submits.
    if (response.ok) {
      try {
        const source = parsed.data.source || 'unknown';
        await db
          .insert(schema.registrations)
          .values({ email, source })
          .onConflictDoNothing({ target: schema.registrations.email });
      } catch (err) {
        console.error('[register] tracking error (ignored):', err);
      }
    }

    return c.json(data, response.status as any);
  } catch (err) {
    console.error('[register] upstream error:', err);
    return c.json({ message: 'Server-Fehler bei der Registrierung.' }, 500);
  }
});

export default app;
