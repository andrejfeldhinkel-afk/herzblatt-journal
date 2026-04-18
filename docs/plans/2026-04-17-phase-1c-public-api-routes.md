# Phase 1c: Public-API-Routes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 5 öffentliche API-Routen (pageview, track-click, newsletter, register, readers) im Backend implementieren — mit Drizzle-DB-Writes, Rate-Limit, CORS. Frontend wird noch NICHT umgebogen (das ist Phase 1f).

**Architecture:** Route-Module pro Endpoint in `apps/backend/src/routes/`, shared helpers in `apps/backend/src/lib/` (IP-Hash, Rate-Limit). Hono als HTTP-Framework, Drizzle für DB-Writes, Zod für Input-Validation. Rate-Limit in-memory (akzeptabel für single-instance, Redis später wenn scaling nötig).

**Tech Stack:** Hono, Drizzle, Zod, postgres.js. Keine neuen Deps.

**Reference:** Design-Doc `docs/plans/2026-04-17-backend-split-design.md` Abschnitt "API-Migrations-Mapping". Quelle der Wahrheit: `apps/frontend/src/pages/api/*.ts` — 1:1-Port.

**Vorbedingungen:**
- Phase 1b komplett durch (Backend + Postgres laufen)
- Schema auf Live-Postgres gepushed (7 Tables, 13 Indexes)
- Railway-Backend deployed auf `backend-production-c327.up.railway.app`
- Admin hat gültigen Railway-API-Token bereit (für ENV-Checks wenn nötig)

---

## Task 1: Branch + Clean State

**Files:** keine Änderung — nur git setup.

**Step 1: Clean state prüfen**

```bash
cd /tmp/herzblatt-deploy
git status
git log --oneline -1
```

Expected: `nothing to commit, working tree clean`, letzter Commit ist Phase-1a-related (`794768f` oder neuer).

**Step 2: Feature-Branch**

```bash
git checkout main
git pull origin main 2>&1 | tail -2
git checkout -b refactor/phase-1c-public-api-routes
```

Expected: Branch angelegt und ausgecheckt.

---

## Task 2: Shared Helper — IP-Hash

**Files:**
- Create: `apps/backend/src/lib/crypto.ts`

**Step 1: crypto.ts**

Inhalt:

```ts
import crypto from 'node:crypto';

/**
 * SHA-256(ip + salt) — DSGVO-konform.
 * Gleiche Logik wie im Frontend-Herzraum-Auth, damit Hashes konsistent bleiben
 * wenn der selbe User von unterschiedlichen Services trackt.
 */
export function hashIp(ip: string): string {
  const salt = process.env.IP_SALT || 'herzblatt-default-salt-please-change';
  return crypto.createHash('sha256').update(ip + salt).digest('hex').slice(0, 32);
}

export function getClientIp(req: Request, headers: Headers): string {
  const xff = headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const real = headers.get('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}
```

**Step 2: Typecheck**

```bash
cd /tmp/herzblatt-deploy
pnpm --filter @herzblatt/backend exec tsc --noEmit
```

Expected: Kein Fehler.

---

## Task 3: Shared Helper — In-Memory Rate-Limiter

**Files:**
- Create: `apps/backend/src/lib/rate-limit.ts`

**Step 1: rate-limit.ts**

Inhalt:

```ts
/**
 * In-memory Rate-Limiter.
 * Key: IP-Hash. State lebt pro Container-Instanz (bei Redeploy reset).
 * Akzeptabel für single-instance Railway-Deploy. Redis später bei Multi-Instance.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

// Auto-cleanup stale buckets every 5 min
setInterval(() => {
  const now = Date.now();
  for (const [key, b] of buckets) {
    if (now > b.resetAt) buckets.delete(key);
  }
}, CLEANUP_INTERVAL_MS);

/**
 * Gibt true zurück wenn Anfrage OK ist (innerhalb Limit).
 * windowMs: Zeitfenster in ms. max: erlaubte Requests in diesem Fenster.
 */
export function allowRequest(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  b.count++;
  return b.count <= max;
}

/**
 * Shared rate-limit: 60 Requests pro Minute pro IP über alle Public-API-Endpoints.
 * Separat pro Endpoint wäre granularer, aber YAGNI für den Start.
 */
export function allowPublicApi(ipHash: string): boolean {
  return allowRequest(ipHash, 60, 60_000);
}
```

**Step 2: Typecheck**

```bash
cd /tmp/herzblatt-deploy
pnpm --filter @herzblatt/backend exec tsc --noEmit
```

Expected: Kein Fehler.

**Step 3: Commit (beide Helpers zusammen)**

```bash
git add apps/backend/src/lib/
git commit -m "feat(backend): shared helpers — IP-Hash + in-memory Rate-Limiter"
```

---

## Task 4: Route-Module — POST /pageview

**Files:**
- Create: `apps/backend/src/routes/pageview.ts`

**Quellreferenz:** `apps/frontend/src/pages/api/pageview.ts` (Event-Log-Format).

**Step 1: pageview.ts**

Inhalt:

```ts
import { Hono } from 'hono';
import { z } from 'zod';
import { db, schema } from '../db/index.js';
import { getClientIp, hashIp } from '../lib/crypto.js';
import { allowPublicApi } from '../lib/rate-limit.js';

const app = new Hono();

const bodySchema = z.object({
  path: z.string().min(1).max(500).regex(/^\/[a-zA-Z0-9\-_/.]+$/),
  referrer: z.string().optional(),
});

function extractReferrerHost(ref: string | null | undefined): string {
  if (!ref) return 'direct';
  try {
    return new URL(ref).hostname || 'direct';
  } catch {
    return 'direct';
  }
}

app.post('/', async (c) => {
  const ip = getClientIp(c.req.raw, c.req.raw.headers);
  if (!allowPublicApi(hashIp(ip))) {
    return c.json({ error: 'rate-limit' }, 429);
  }

  let body: unknown;
  try { body = await c.req.json(); }
  catch { return c.json({ error: 'invalid-json' }, 400); }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid-body' }, 400);
  }

  // Path-traversal safety check
  if (parsed.data.path.includes('..') || parsed.data.path.includes('//')) {
    return c.json({ error: 'invalid-path' }, 400);
  }

  const ua = (c.req.header('user-agent') || '').slice(0, 200);
  const referrerHost = extractReferrerHost(parsed.data.referrer || c.req.header('referer') || null);

  try {
    await db.insert(schema.pageviews).values({
      path: parsed.data.path,
      referrer: referrerHost,
      ua,
    });
    return c.json({ ok: true });
  } catch (err) {
    console.error('[pageview] db error:', err);
    return c.json({ ok: false }, 500);
  }
});

export default app;
```

**Step 2: Typecheck**

```bash
cd /tmp/herzblatt-deploy
pnpm --filter @herzblatt/backend exec tsc --noEmit
```

Expected: Kein Fehler.

---

## Task 5: Route-Module — POST /track-click

**Files:**
- Create: `apps/backend/src/routes/track-click.ts`

**Quellreferenz:** `apps/frontend/src/pages/api/track-click.ts` (Event-Log-Format).

**Step 1: track-click.ts**

Inhalt:

```ts
import { Hono } from 'hono';
import { z } from 'zod';
import { db, schema } from '../db/index.js';
import { getClientIp, hashIp } from '../lib/crypto.js';
import { allowPublicApi } from '../lib/rate-limit.js';

const app = new Hono();

// Whitelist von erlaubten Affiliate-Targets — gleich wie Frontend-Version
const ALLOWED_TARGETS = new Set([
  'xloves', 'michverlieben', 'whatsmeet', 'onlydates69', 'singles69', 'singlescout',
  'iloves', 'sex69',
  'parship', 'elitepartner', 'lovescout24', 'edarling', 'bumble',
  'tinder', 'hinge', 'okcupid', 'happn', 'badoo', 'finya',
  'lovepoint', 'c-date', 'joyclub', 'secret', 'ashley-madison',
  'once', 'zoosk', 'match', 'plenty-of-fish',
]);

const TARGET_REGEX = /^[a-z0-9-]+$/;

function sanitizePath(p: unknown): string {
  if (typeof p !== 'string') return 'unknown';
  if (!p.startsWith('/') || p.length > 200 || p.includes('..')) return 'unknown';
  if (!/^[a-zA-Z0-9\-_/.]+$/.test(p)) return 'unknown';
  return p;
}

app.post('/', async (c) => {
  const ip = getClientIp(c.req.raw, c.req.raw.headers);
  if (!allowPublicApi(hashIp(ip))) {
    return c.json({ error: 'rate-limit' }, 429);
  }

  // Accept both JSON and urlencoded (sendBeacon kann beides senden)
  let body: any = {};
  const ct = c.req.header('content-type') || '';
  if (ct.includes('application/json')) {
    try { body = await c.req.json(); }
    catch { return c.json({ error: 'invalid-json' }, 400); }
  } else {
    const text = await c.req.text();
    try { body = JSON.parse(text); }
    catch {
      body = Object.fromEntries(new URLSearchParams(text).entries());
    }
  }

  const rawTarget = typeof body?.site === 'string'
    ? body.site
    : (typeof body?.target === 'string' ? body.target : '');
  const target = rawTarget.trim().toLowerCase();

  if (!target || target.length > 50 || !TARGET_REGEX.test(target)) {
    return c.json({ error: 'invalid-target' }, 400);
  }

  // Unbekannte targets werden still ignoriert (nicht als Fehler)
  if (!ALLOWED_TARGETS.has(target)) {
    return c.json({ ok: true, ignored: true });
  }

  const source = sanitizePath(body?.source || c.req.header('referer'));
  const type = typeof body?.event === 'string' ? body.event.slice(0, 40) : 'affiliate';

  try {
    await db.insert(schema.clicks).values({
      target,
      source,
      type,
    });
    return c.json({ ok: true });
  } catch (err) {
    console.error('[track-click] db error:', err);
    return c.json({ ok: false }, 500);
  }
});

export default app;
```

**Step 2: Typecheck**

```bash
cd /tmp/herzblatt-deploy
pnpm --filter @herzblatt/backend exec tsc --noEmit
```

Expected: Kein Fehler.

---

## Task 6: Route-Module — POST /newsletter

**Files:**
- Create: `apps/backend/src/routes/newsletter.ts`

**Quellreferenz:** `apps/frontend/src/pages/api/newsletter.ts` (CSV-basierte Version, wir konvertieren zu DB-Insert mit gleicher Feld-Struktur).

**Step 1: newsletter.ts**

Inhalt:

```ts
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
```

**Step 2: Typecheck**

```bash
cd /tmp/herzblatt-deploy
pnpm --filter @herzblatt/backend exec tsc --noEmit
```

Expected: Kein Fehler.

---

## Task 7: Route-Module — POST /register

**Files:**
- Create: `apps/backend/src/routes/register.ts`

**Quellreferenz:** `apps/frontend/src/pages/api/register.ts` (Proxy zu xLoves + lokales Tracking).

**Step 1: register.ts**

Inhalt:

```ts
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

    // Nur bei Erfolg lokal tracken — Fehler beim Tracking dürfen Response nicht blockieren
    if (response.ok) {
      try {
        const source = parsed.data.source || 'unknown';
        await db.insert(schema.registrations).values({ email, source });
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
```

**Step 2: Typecheck**

```bash
cd /tmp/herzblatt-deploy
pnpm --filter @herzblatt/backend exec tsc --noEmit
```

Expected: Kein Fehler.

---

## Task 8: Route-Module — GET /readers

**Files:**
- Create: `apps/backend/src/routes/readers.ts`

**Quellreferenz:** `apps/frontend/src/pages/api/readers.ts` (Fake-Counter mit simuliertem Wachstum).

**Step 1: readers.ts**

Inhalt:

```ts
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

const app = new Hono();

app.get('/', async (c) => {
  try {
    // Hole oder initialisiere die einzige Row
    const rows = await db.select().from(schema.readersCounter).limit(1);
    const now = new Date();

    if (rows.length === 0) {
      // Erstmalig: Initial-Insert
      const inserted = await db
        .insert(schema.readersCounter)
        .values({ count: 12847, lastUpdated: now })
        .returning();
      return c.json({ count: inserted[0].count }, 200, { 'Cache-Control': 'no-cache' });
    }

    const row = rows[0];
    const last = new Date(row.lastUpdated);
    const hoursDiff = (now.getTime() - last.getTime()) / (1000 * 60 * 60);

    // ~50-150 readers pro Stunde (natural growth simulation)
    const growth = Math.max(1, Math.floor(hoursDiff * (50 + Math.random() * 100)));
    const cappedGrowth = Math.min(growth, 500);

    const newCount = row.count + cappedGrowth;

    await db
      .update(schema.readersCounter)
      .set({ count: newCount, lastUpdated: now })
      .where(eq(schema.readersCounter.id, row.id));

    return c.json({ count: newCount }, 200, { 'Cache-Control': 'no-cache' });
  } catch (err) {
    console.error('[readers] db error:', err);
    // Fallback-Wert bei DB-Problemen
    return c.json({ count: 12847 }, 200);
  }
});

export default app;
```

**Step 2: Typecheck**

```bash
cd /tmp/herzblatt-deploy
pnpm --filter @herzblatt/backend exec tsc --noEmit
```

Expected: Kein Fehler.

**Step 3: Alle 5 Routen Commit**

```bash
git add apps/backend/src/routes/
git commit -m "feat(backend): 5 public API-Routes (pageview, track-click, newsletter, register, readers)

1:1 Port aus apps/frontend/src/pages/api/* mit DB-Writes statt JSON-Files.
- POST /pageview  → insert into pageviews
- POST /track-click → insert into clicks (Whitelist-validiert, sendBeacon kompatibel)
- POST /newsletter → insert into subscribers (dedupe nach email)
- POST /register → proxy zu xLoves + insert into registrations bei Success
- GET  /readers → upsert readers_counter mit simuliertem Wachstum

Alle mit Zod-Validation + Rate-Limit (60/min shared, 10/h für NL/Register)."
```

---

## Task 9: index.ts — Alle Routes mounten

**Files:**
- Modify: `apps/backend/src/index.ts`

**Step 1: index.ts komplett erweitern**

Inhalt (ersetze bisherige minimal-Version):

```ts
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

import pageviewRoute from './routes/pageview.js';
import trackClickRoute from './routes/track-click.js';
import newsletterRoute from './routes/newsletter.js';
import registerRoute from './routes/register.js';
import readersRoute from './routes/readers.js';

const app = new Hono();

app.use('*', cors({
  origin: (process.env.ALLOWED_ORIGINS || 'http://localhost:4321').split(',').map(s => s.trim()),
  credentials: true,
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600,
}));

// Health-Check
app.get('/health', (c) => c.json({ ok: true, service: 'herzblatt-backend', ts: new Date().toISOString() }));

// Root
app.get('/', (c) => c.text('Herzblatt Backend API — siehe /health'));

// Public API Routes
app.route('/pageview', pageviewRoute);
app.route('/track-click', trackClickRoute);
app.route('/newsletter', newsletterRoute);
app.route('/register', registerRoute);
app.route('/readers', readersRoute);

const port = Number(process.env.PORT) || 3001;
const host = process.env.HOST || '0.0.0.0';

serve({
  fetch: app.fetch,
  port,
  hostname: host,
}, (info) => {
  console.log(`[backend] listening on http://${info.address}:${info.port}`);
});
```

**Step 2: Typecheck**

```bash
cd /tmp/herzblatt-deploy
pnpm --filter @herzblatt/backend exec tsc --noEmit
```

Expected: Kein Fehler.

**Step 3: Build**

```bash
cd /tmp/herzblatt-deploy
pnpm --filter @herzblatt/backend build 2>&1 | tail -5
ls apps/backend/dist/
```

Expected: `dist/index.js`, `dist/routes/*.js`, `dist/lib/*.js`, `dist/db/*.js` alle existent.

**Step 4: Commit**

```bash
git add apps/backend/src/index.ts
git commit -m "feat(backend): alle 5 routes in main App gemounted"
```

---

## Task 10: Lokaler Smoke-Test

**Files:** keine Änderung — nur Verifikation.

**Voraussetzung:** `.env` mit `DATABASE_URL` auf Live-Railway-Postgres (oder lokaler Postgres).

**Step 1: .env für lokalen Test anlegen**

```bash
cd /tmp/herzblatt-deploy
cat > apps/backend/.env <<EOF
DATABASE_URL=postgresql://postgres:e7147daa8a429bdaa6c4d49157ef9de8@nozomi.proxy.rlwy.net:13270/herzblatt
PORT=3001
HOST=0.0.0.0
ALLOWED_ORIGINS=http://localhost:4321
IP_SALT=dev-salt-local
REGISTER_API_URL=https://be.xloves.com/api/auth/register
EOF
```

**⚠ Diese `.env` ist gitignored — niemals committen.**

**Step 2: Backend starten**

```bash
cd /tmp/herzblatt-deploy
pnpm --filter @herzblatt/backend dev > /tmp/backend-test.log 2>&1 &
sleep 4
cat /tmp/backend-test.log | head -8
```

Expected-Output-Snippet:
```
[backend] listening on http://0.0.0.0:3001
```

**Step 3: /health**

```bash
curl -s http://localhost:3001/health
echo ""
```

Expected: `{"ok":true,"service":"herzblatt-backend","ts":"..."}`

**Step 4: POST /pageview**

```bash
curl -s -X POST http://localhost:3001/pageview \
  -H "Content-Type: application/json" \
  -d '{"path":"/test","referrer":"https://google.com"}'
echo ""
```

Expected: `{"ok":true}`

**Step 5: POST /track-click**

```bash
curl -s -X POST http://localhost:3001/track-click \
  -H "Content-Type: application/json" \
  -d '{"site":"xloves","source":"/blog/test"}'
echo ""
```

Expected: `{"ok":true}`

**Step 6: POST /newsletter (neue Email)**

```bash
curl -s -X POST http://localhost:3001/newsletter \
  -H "Content-Type: application/json" \
  -d '{"email":"claude-test-'$(date +%s)'@example.com","source":"newsletter-footer"}'
echo ""
```

Expected: `{"success":true,"message":"Willkommen!..."}`

**Step 7: POST /newsletter (dupe check)**

```bash
curl -s -X POST http://localhost:3001/newsletter \
  -H "Content-Type: application/json" \
  -d '{"email":"claude-test@example.com","source":"newsletter-footer"}'
echo ""
# 2. Call mit GLEICHER Email
curl -s -X POST http://localhost:3001/newsletter \
  -H "Content-Type: application/json" \
  -d '{"email":"claude-test@example.com","source":"newsletter-footer"}'
echo ""
```

Expected:
- 1. Call: `{"success":true,"message":"Willkommen!..."}`
- 2. Call: `{"success":true,"message":"Du bist bereits angemeldet!"}`

**Step 8: GET /readers**

```bash
curl -s http://localhost:3001/readers
echo ""
```

Expected: `{"count":12847}` oder höher.

**Step 9: DB verify — counts pro Tabelle**

```bash
cd /tmp/herzblatt-deploy/apps/backend
node -e "
import('postgres').then(({ default: postgres }) => {
  const sql = postgres(process.env.DATABASE_URL);
  return Promise.all([
    sql\`SELECT COUNT(*) as n FROM pageviews\`,
    sql\`SELECT COUNT(*) as n FROM clicks\`,
    sql\`SELECT COUNT(*) as n FROM subscribers\`,
    sql\`SELECT COUNT(*) as n FROM readers_counter\`,
  ]).then(([pv, cl, sub, rc]) => {
    console.log('pageviews:', pv[0].n);
    console.log('clicks:', cl[0].n);
    console.log('subscribers:', sub[0].n);
    console.log('readers_counter:', rc[0].n);
    return sql.end();
  });
});
"
```

Expected: 
- pageviews: 1+
- clicks: 1+
- subscribers: 1+
- readers_counter: 1

**Step 10: Backend killen**

```bash
pkill -f "tsx watch src/index.ts" 2>/dev/null
sleep 1
```

---

## Task 11: Merge + Push

**Step 1: Branch-Commits prüfen**

```bash
cd /tmp/herzblatt-deploy
git log --oneline refactor/phase-1c-public-api-routes ^main
```

Expected: 3 Commits (helpers, routes, index mount).

**Step 2: Merge zu main**

```bash
git checkout main
git merge --no-ff refactor/phase-1c-public-api-routes -m "Merge: Phase 1c — 5 public API-Routes im Backend

apps/backend/ hat jetzt:
- shared helpers: IP-Hash, in-memory Rate-Limiter
- Routes: /pageview, /track-click, /newsletter, /register, /readers
- Alle mit Zod-Validation, Rate-Limit, DB-Writes via Drizzle
- 1:1 Port aus apps/frontend/src/pages/api/* — Verhalten identisch

Lokaler Smoke-Test mit Live-Postgres erfolgreich (counts in allen Tabellen).

Frontend wird noch NICHT umgebogen (Phase 1f). Astro-API-Routes bleiben
parallel aktiv — Event-Daten gehen aktuell weiter in data/*.json (ephemer)
und nach Phase 1f dann ausschließlich in Postgres."
```

**Step 3: Push**

```bash
git push origin main 2>&1 | tail -3
```

Expected: `main -> main` mit neuem Commit.

**Hinweis:** Push triggert Railway-Backend-Rebuild (da rootDirectory=apps/backend). Frontend-Rebuild wird NICHT getriggert (rootDirectory=apps/frontend, Backend-Änderungen werden ignoriert).

---

## Task 12: Live-Verifikation (Railway-Backend)

**Files:** keine Änderung — nur Verifikation.

**Step 1: Monitor Railway-Deploy**

Entweder via GraphQL-API (Token nötig) oder einfach warten + curl.

Empfehlung: 3-4 Minuten warten, dann:

```bash
curl -s https://backend-production-c327.up.railway.app/health
echo ""
```

Expected: `{"ok":true,...}` mit **neuem Timestamp**.

**Step 2: Live-API-Tests**

```bash
BASE=https://backend-production-c327.up.railway.app
echo "=== pageview ===" && curl -s -X POST $BASE/pageview \
  -H "Content-Type: application/json" \
  -d '{"path":"/smoketest"}' ; echo ""
echo "=== track-click ===" && curl -s -X POST $BASE/track-click \
  -H "Content-Type: application/json" \
  -d '{"site":"xloves","source":"/smoketest"}' ; echo ""
echo "=== newsletter (dupe, sollte \"bereits angemeldet\" sein, wenn test-email schon in DB) ===" && curl -s -X POST $BASE/newsletter \
  -H "Content-Type: application/json" \
  -d '{"email":"claude-test@example.com","source":"newsletter-footer"}' ; echo ""
echo "=== readers ===" && curl -s $BASE/readers ; echo ""
```

Expected: Alle Responses sind sinnvolle JSON ohne 5xx.

**Step 3: DB-Counts erneut prüfen (sollten gestiegen sein)**

```bash
cd /tmp/herzblatt-deploy/apps/backend
export DATABASE_URL="postgresql://postgres:<password>@nozomi.proxy.rlwy.net:13270/herzblatt"
node -e "
import('postgres').then(({ default: postgres }) => {
  const sql = postgres(process.env.DATABASE_URL);
  return Promise.all([
    sql\`SELECT COUNT(*) as n FROM pageviews\`,
    sql\`SELECT COUNT(*) as n FROM clicks\`,
  ]).then(([pv, cl]) => {
    console.log('pageviews:', pv[0].n);
    console.log('clicks:', cl[0].n);
    return sql.end();
  });
});
"
```

Expected: counts > vorherige Werte.

---

## Phase 1c abgeschlossen — was jetzt funktioniert

- ✅ Backend hat 5 öffentliche Endpoints, alle schreiben in Live-Postgres
- ✅ Lokaler Smoke-Test erfolgreich (alle DBs befüllt)
- ✅ Live-Smoke-Test auf `backend-production-c327.up.railway.app` erfolgreich
- ✅ Frontend bleibt unverändert — keine Auswirkung auf herzblatt-journal.com
- ✅ Keine neuen Railway-Services nötig, kein Frontend-Rebuild getriggert

## Nicht in Phase 1c

- Auth (Herzraum-Session) — Phase 1d
- Admin-Routes — Phase 1d
- Legacy-Import aus data/subscribers.csv — Phase 1e
- Frontend-fetch-Calls umbiegen — Phase 1f

## Rollback

Falls ein Route-Bug Backend crasht:

```bash
cd /tmp/herzblatt-deploy
git revert HEAD --no-edit
git push origin main
```

Railway rollt auf Phase-1b-Stand zurück (nur /health), Frontend bleibt unaffekt.
