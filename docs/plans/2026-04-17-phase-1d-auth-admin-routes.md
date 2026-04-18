# Phase 1d: Auth + Herzraum Admin-Routes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Herzraum-Auth-System (Login/Logout/Verify mit Session-DB) + alle Admin-Endpoints portieren, plus Bearer-Token-Route für `scripts/pull-subscribers.sh`. Nach Phase 1d kann das Frontend nur noch auf Backend umgebogen werden (Phase 1f).

**Architecture:** Opaque-Token (32 random bytes), SHA-256-Hash in `sessions`-Tabelle, Cookie `hz_session` mit `Domain=.herzblatt-journal.com; SameSite=Lax`. Middleware als Hono-Handler. Login-Rate-Limit via `login_attempts` Tabelle (5 Fehlversuche / 10 min / IP-Hash). Alle Admin-Routes protected, Bearer-Token-Route hat separaten Auth-Pfad.

**Tech Stack:** Hono, Drizzle (sessions, login_attempts, readers_counter Tables), Zod. Keine neuen Deps.

**Reference:** 
- Design-Doc `docs/plans/2026-04-17-backend-split-design.md` (Abschnitt "Auth-Modell")
- Quelle für Port: `apps/frontend/src/pages/api/herzraum/*.ts` + `apps/frontend/src/pages/api/admin/subscribers.csv.ts`
- Auth-Helper im Frontend: `apps/frontend/src/lib/herzraum-auth.ts` (Referenz für Session-Logic)

**Vorbedingungen:**
- Phase 1c durch (5 Public-Routes live)
- ENV-Vars auf Railway gesetzt: `HERZRAUM_PASSWORD`, `IP_SALT`, `ADMIN_TOKEN`
- Backend auf `backend-production-c327.up.railway.app` antwortet

---

## Task 1: Feature-Branch

```bash
cd /tmp/herzblatt-deploy
git pull origin main 2>&1 | tail -2
git checkout -b refactor/phase-1d-auth-admin
```

Expected: `Switched to a new branch 'refactor/phase-1d-auth-admin'`.

---

## Task 2: Session-Helper

**Files:**
- Create: `apps/backend/src/lib/session.ts`

**Inhalt:**

```ts
import crypto from 'node:crypto';
import { and, eq, gt, lt, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { hashIp } from './crypto.js';

export const COOKIE_NAME = 'hz_session';
export const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;
export const LOGIN_RATE_WINDOW_MS = 10 * 60 * 1000;
export const LOGIN_RATE_MAX = 5;

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'utf-8'), Buffer.from(b, 'utf-8'));
  } catch {
    return false;
  }
}

export type LoginResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'rate-limit' | 'invalid-password' | 'not-configured' };

/**
 * Prüft Passwort + legt bei Erfolg Session in DB an.
 * Rate-Limit: max 5 fehlgeschlagene Versuche / 10 min pro IP-Hash.
 */
export async function attemptLogin(password: string, clientIp: string): Promise<LoginResult> {
  const expected = process.env.HERZRAUM_PASSWORD;
  if (!expected || expected.length < 8) {
    return { ok: false, reason: 'not-configured' };
  }
  const ipH = hashIp(clientIp);
  const now = new Date();
  const windowStart = new Date(now.getTime() - LOGIN_RATE_WINDOW_MS);

  const recent = await db
    .select({ id: schema.loginAttempts.id })
    .from(schema.loginAttempts)
    .where(and(
      eq(schema.loginAttempts.ipHash, ipH),
      eq(schema.loginAttempts.success, false),
      gt(schema.loginAttempts.ts, windowStart),
    ));
  if (recent.length >= LOGIN_RATE_MAX) {
    return { ok: false, reason: 'rate-limit' };
  }

  const pwOk = timingSafeEqual(password, expected);
  await db.insert(schema.loginAttempts).values({
    ipHash: ipH,
    success: pwOk,
  });

  if (!pwOk) return { ok: false, reason: 'invalid-password' };

  const token = crypto.randomBytes(32).toString('base64url');
  await db.insert(schema.sessions).values({
    tokenHash: hashToken(token),
    expiresAt: new Date(now.getTime() + SESSION_DURATION_MS),
    ipHash: ipH,
  });

  return { ok: true, token };
}

/**
 * Prüft ob Token einer gültigen, nicht-abgelaufenen Session entspricht.
 * Cleanup abgelaufener Sessions nebenbei.
 */
export async function verifySession(token: string | null | undefined): Promise<boolean> {
  if (!token || typeof token !== 'string' || token.length < 20) return false;

  // Opportunistisch abgelaufene Sessions löschen
  await db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date()));

  const row = await db
    .select({ id: schema.sessions.id })
    .from(schema.sessions)
    .where(and(
      eq(schema.sessions.tokenHash, hashToken(token)),
      gt(schema.sessions.expiresAt, new Date()),
    ))
    .limit(1);

  return row.length > 0;
}

export async function destroySession(token: string | null | undefined): Promise<void> {
  if (!token) return;
  await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, hashToken(token)));
}

export function verifyCurrentPassword(password: string): boolean {
  const expected = process.env.HERZRAUM_PASSWORD;
  if (!expected) return false;
  return timingSafeEqual(password, expected);
}

export function extractTokenFromCookie(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp('(?:^|; )' + COOKIE_NAME + '=([^;]+)'));
  return match ? decodeURIComponent(match[1]) : null;
}

export function buildSessionCookie(token: string, maxAgeSec: number = SESSION_DURATION_MS / 1000): string {
  return [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Secure',
    `Max-Age=${maxAgeSec}`,
    'Domain=.herzblatt-journal.com',
  ].join('; ');
}

export function buildLogoutCookie(): string {
  return [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Secure',
    'Max-Age=0',
    'Domain=.herzblatt-journal.com',
  ].join('; ');
}
```

**Typecheck:**

```bash
cd /tmp/herzblatt-deploy
pnpm --filter @herzblatt/backend exec tsc --noEmit
```

Expected: Kein Fehler.

---

## Task 3: Auth-Middleware

**Files:**
- Create: `apps/backend/src/lib/auth-middleware.ts`

**Inhalt:**

```ts
import type { Context, MiddlewareHandler } from 'hono';
import { extractTokenFromCookie, verifySession } from './session.js';

/**
 * Hono-Middleware: Prüft Cookie-Session. Bei ungültig → 401 JSON.
 * Usage: app.use('/herzraum/*', requireSession);
 */
export const requireSession: MiddlewareHandler = async (c, next) => {
  const token = extractTokenFromCookie(c.req.header('cookie'));
  const ok = await verifySession(token);
  if (!ok) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
};

/**
 * Bearer-Token-Auth: Vergleicht Authorization: Bearer <token> gegen ADMIN_TOKEN env.
 * Für scripts/pull-subscribers.sh und ähnliche.
 */
export const requireAdminToken: MiddlewareHandler = async (c, next) => {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected || expected.length < 20) {
    return c.json({ error: 'Admin endpoint not configured' }, 503);
  }
  const header = c.req.header('authorization') || '';
  const provided = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!provided || !timingSafeStrEqual(provided, expected)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
};

function timingSafeStrEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    const crypto = require('node:crypto');
    return crypto.timingSafeEqual(Buffer.from(a, 'utf-8'), Buffer.from(b, 'utf-8'));
  } catch {
    return false;
  }
}
```

**⚠ Hinweis:** ESM erlaubt kein `require()`. Muss gefixt werden:

```ts
import crypto from 'node:crypto';

function timingSafeStrEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'utf-8'), Buffer.from(b, 'utf-8'));
  } catch {
    return false;
  }
}
```

**Typecheck:**

```bash
cd /tmp/herzblatt-deploy
pnpm --filter @herzblatt/backend exec tsc --noEmit
```

Expected: Kein Fehler.

**Commit (Tasks 2+3):**

```bash
git add apps/backend/src/lib/session.ts apps/backend/src/lib/auth-middleware.ts
git commit -m "feat(backend): session-management + auth-middleware

- lib/session.ts: attemptLogin, verifySession, destroySession, cookie helpers
- lib/auth-middleware.ts: requireSession (cookie), requireAdminToken (bearer)
- Opaque token, SHA-256-hash in sessions DB table
- Rate-Limit 5/10min via login_attempts DB table
- Cookie Domain=.herzblatt-journal.com für cross-subdomain sharing"
```

---

## Task 4: Auth-Routes (login/logout/verify)

**Files:**
- Create: `apps/backend/src/routes/auth.ts`

**Inhalt:**

```ts
import { Hono } from 'hono';
import { z } from 'zod';
import {
  attemptLogin,
  buildLogoutCookie,
  buildSessionCookie,
  destroySession,
  extractTokenFromCookie,
  verifySession,
} from '../lib/session.js';
import { getClientIp } from '../lib/crypto.js';

const app = new Hono();

const loginSchema = z.object({
  password: z.string().min(1).max(256),
});

app.post('/login', async (c) => {
  const ct = c.req.header('content-type') || '';
  if (!ct.includes('application/json')) {
    return c.json({ ok: false, message: 'Invalid content type.' }, 400);
  }

  let body: unknown;
  try { body = await c.req.json(); }
  catch { return c.json({ ok: false, message: 'Ungültige Eingabe.' }, 400); }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, message: 'Ungültige Eingabe.' }, 400);
  }

  const ip = getClientIp(c.req.raw, c.req.raw.headers);
  const result = await attemptLogin(parsed.data.password, ip);

  if (!result.ok) {
    if (result.reason === 'rate-limit') {
      return c.json({ ok: false, message: 'Zu viele Versuche. Bitte in einigen Minuten erneut.' }, 429);
    }
    if (result.reason === 'not-configured') {
      return c.json({ ok: false, message: 'Herzraum ist nicht konfiguriert.' }, 503);
    }
    return c.json({ ok: false, message: 'Anmeldung fehlgeschlagen.' }, 401);
  }

  c.header('Set-Cookie', buildSessionCookie(result.token));
  return c.json({ ok: true, redirect: '/herzraum' });
});

// POST /auth/logout — API-style (JSON)
app.post('/logout', async (c) => {
  const token = extractTokenFromCookie(c.req.header('cookie'));
  await destroySession(token);
  c.header('Set-Cookie', buildLogoutCookie());
  return c.json({ ok: true });
});

// GET /auth/logout — Link-style (Redirect)
app.get('/logout', async (c) => {
  const token = extractTokenFromCookie(c.req.header('cookie'));
  await destroySession(token);
  c.header('Set-Cookie', buildLogoutCookie());
  return c.redirect('https://herzblatt-journal.com/herzraum/login', 302);
});

// GET /auth/verify — für Astro-Middleware, gibt 200 bei gültiger Session
app.get('/verify', async (c) => {
  const token = extractTokenFromCookie(c.req.header('cookie'));
  const ok = await verifySession(token);
  return c.json({ ok }, ok ? 200 : 401);
});

export default app;
```

**Typecheck + Commit:**

```bash
cd /tmp/herzblatt-deploy
pnpm --filter @herzblatt/backend exec tsc --noEmit
git add apps/backend/src/routes/auth.ts
git commit -m "feat(backend): /auth/login, /logout, /verify routes"
```

---

## Task 5: Herzraum /stats Route

**Files:**
- Create: `apps/backend/src/routes/herzraum/stats.ts`

**Quellreferenz:** `apps/frontend/src/pages/api/herzraum/stats.ts`.

**Inhalt:**

```ts
import { Hono } from 'hono';
import { and, count, desc, eq, gt, sql } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';

const app = new Hono();

function daysAgoDate(days: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return new Date(d.getTime() - days * 86_400_000);
}

app.get('/', async (c) => {
  const rangeParam = c.req.query('range') || '30d';
  const days = rangeParam === 'today' ? 1 : rangeParam === '7d' ? 7 : rangeParam === '90d' ? 90 : 30;

  const todayStart = daysAgoDate(0);
  const weekStart = daysAgoDate(7);
  const monthStart = daysAgoDate(30);
  const rangeStart = daysAgoDate(days);

  // KPIs (parallel)
  const [
    pvToday, pvWeek, pvMonth, pvTotal,
    clickToday, clickWeek, clickMonth, clickTotal,
    regToday, regWeek, regMonth, regTotal,
    nlToday, nlWeek, nlMonth, nlTotal,
  ] = await Promise.all([
    db.select({ n: count() }).from(schema.pageviews).where(gt(schema.pageviews.ts, todayStart)),
    db.select({ n: count() }).from(schema.pageviews).where(gt(schema.pageviews.ts, weekStart)),
    db.select({ n: count() }).from(schema.pageviews).where(gt(schema.pageviews.ts, monthStart)),
    db.select({ n: count() }).from(schema.pageviews),
    db.select({ n: count() }).from(schema.clicks).where(gt(schema.clicks.ts, todayStart)),
    db.select({ n: count() }).from(schema.clicks).where(gt(schema.clicks.ts, weekStart)),
    db.select({ n: count() }).from(schema.clicks).where(gt(schema.clicks.ts, monthStart)),
    db.select({ n: count() }).from(schema.clicks),
    db.select({ n: count() }).from(schema.registrations).where(gt(schema.registrations.createdAt, todayStart)),
    db.select({ n: count() }).from(schema.registrations).where(gt(schema.registrations.createdAt, weekStart)),
    db.select({ n: count() }).from(schema.registrations).where(gt(schema.registrations.createdAt, monthStart)),
    db.select({ n: count() }).from(schema.registrations),
    db.select({ n: count() }).from(schema.subscribers).where(gt(schema.subscribers.createdAt, todayStart)),
    db.select({ n: count() }).from(schema.subscribers).where(gt(schema.subscribers.createdAt, weekStart)),
    db.select({ n: count() }).from(schema.subscribers).where(gt(schema.subscribers.createdAt, monthStart)),
    db.select({ n: count() }).from(schema.subscribers),
  ]);

  // Top Articles (30d)
  const topArticles = await db
    .select({
      path: schema.pageviews.path,
      n: count().as('n'),
    })
    .from(schema.pageviews)
    .where(gt(schema.pageviews.ts, monthStart))
    .groupBy(schema.pageviews.path)
    .orderBy(desc(sql`n`))
    .limit(10);

  // Top Referrer (30d)
  const topReferrers = await db
    .select({
      referrer: schema.pageviews.referrer,
      n: count().as('n'),
    })
    .from(schema.pageviews)
    .where(gt(schema.pageviews.ts, monthStart))
    .groupBy(schema.pageviews.referrer)
    .orderBy(desc(sql`n`))
    .limit(10);

  // Top Click Targets (30d)
  const topClickTargets = await db
    .select({
      target: schema.clicks.target,
      n: count().as('n'),
    })
    .from(schema.clicks)
    .where(gt(schema.clicks.ts, monthStart))
    .groupBy(schema.clicks.target)
    .orderBy(desc(sql`n`))
    .limit(10);

  // Daily aggregates (pageviews/clicks for range)
  const pvByDayRaw = await db
    .select({
      day: sql<string>`to_char(${schema.pageviews.ts}, 'YYYY-MM-DD')`.as('day'),
      n: count().as('n'),
    })
    .from(schema.pageviews)
    .where(gt(schema.pageviews.ts, rangeStart))
    .groupBy(sql`day`)
    .orderBy(sql`day`);

  const clickByDayRaw = await db
    .select({
      day: sql<string>`to_char(${schema.clicks.ts}, 'YYYY-MM-DD')`.as('day'),
      n: count().as('n'),
    })
    .from(schema.clicks)
    .where(gt(schema.clicks.ts, rangeStart))
    .groupBy(sql`day`)
    .orderBy(sql`day`);

  // Fülle Lücken auf für durchgehende X-Achse
  function fillDays(rows: { day: string; n: number }[], days: number) {
    const map = new Map(rows.map(r => [r.day, Number(r.n)]));
    const out: { date: string; count: number }[] = [];
    const end = new Date();
    end.setUTCHours(0, 0, 0, 0);
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(end.getTime() - i * 86_400_000);
      const key = d.toISOString().slice(0, 10);
      out.push({ date: key, count: map.get(key) || 0 });
    }
    return out;
  }

  const pvByDay = fillDays(pvByDayRaw as any, days);
  const clicksByDay = fillDays(clickByDayRaw as any, days);

  // Recent activity (letzte 20 Pageviews)
  const recent = await db
    .select({
      ts: schema.pageviews.ts,
      path: schema.pageviews.path,
      referrer: schema.pageviews.referrer,
    })
    .from(schema.pageviews)
    .orderBy(desc(schema.pageviews.ts))
    .limit(20);

  // CTR
  const pvT = Number(pvTotal[0]?.n || 0);
  const clT = Number(clickTotal[0]?.n || 0);
  const ctr = pvT > 0 ? Math.round((clT / pvT) * 10000) / 100 : 0;

  return c.json({
    ok: true,
    range: rangeParam,
    days,
    kpis: {
      pageviews: {
        today: Number(pvToday[0]?.n || 0),
        week: Number(pvWeek[0]?.n || 0),
        month: Number(pvMonth[0]?.n || 0),
        total: pvT,
      },
      clicks: {
        today: Number(clickToday[0]?.n || 0),
        week: Number(clickWeek[0]?.n || 0),
        month: Number(clickMonth[0]?.n || 0),
        total: clT,
      },
      registrations: {
        today: Number(regToday[0]?.n || 0),
        week: Number(regWeek[0]?.n || 0),
        month: Number(regMonth[0]?.n || 0),
        total: Number(regTotal[0]?.n || 0),
      },
      newsletter: {
        today: Number(nlToday[0]?.n || 0),
        week: Number(nlWeek[0]?.n || 0),
        month: Number(nlMonth[0]?.n || 0),
        total: Number(nlTotal[0]?.n || 0),
      },
    },
    topArticles: topArticles.map(a => ({ slug: a.path, count: Number(a.n) })),
    topReferrers: topReferrers.map(r => ({ key: r.referrer || 'direct', count: Number(r.n) })),
    topClickTargets: topClickTargets.map(t => ({ key: t.target, count: Number(t.n) })),
    charts: {
      pageviewsByDay: pvByDay,
      clicksByDay,
    },
    recentActivity: recent.map(r => ({
      ts: r.ts instanceof Date ? r.ts.toISOString() : r.ts,
      path: r.path,
      referrer: r.referrer || 'direct',
    })),
    ctr,
  });
});

export default app;
```

---

## Task 6: Herzraum /clicks/sources Route

**Files:**
- Create: `apps/backend/src/routes/herzraum/clicks-sources.ts`

**Inhalt:**

```ts
import { Hono } from 'hono';
import { count, desc, gt, sql } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';

const app = new Hono();

app.get('/', async (c) => {
  const daysParam = Number(c.req.query('days') || '30');
  const days = isFinite(daysParam) && daysParam > 0 && daysParam <= 365 ? daysParam : 30;

  const cutoff = new Date(Date.now() - days * 86_400_000);

  const rows = await db
    .select({
      source: schema.clicks.source,
      n: count().as('n'),
    })
    .from(schema.clicks)
    .where(gt(schema.clicks.ts, cutoff))
    .groupBy(schema.clicks.source)
    .orderBy(desc(sql`n`))
    .limit(25);

  return c.json({
    ok: true,
    sources: rows.map(r => ({ source: r.source || 'unknown', count: Number(r.n) })),
  });
});

export default app;
```

---

## Task 7: Herzraum /newsletter/list + /newsletter/export

**Files:**
- Create: `apps/backend/src/routes/herzraum/newsletter.ts`

**Inhalt:**

```ts
import { Hono } from 'hono';
import { desc } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';

const app = new Hono();

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  return `${local.slice(0, 1)}***@${domain}`;
}

app.get('/list', async (c) => {
  const mask = c.req.query('mask') !== 'false';

  const rows = await db
    .select({
      email: schema.subscribers.email,
      createdAt: schema.subscribers.createdAt,
      source: schema.subscribers.source,
    })
    .from(schema.subscribers)
    .orderBy(desc(schema.subscribers.createdAt))
    .limit(1000);

  const total = rows.length;
  const entries = rows.map(r => ({
    email: mask ? maskEmail(r.email) : r.email,
    ts: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    source: r.source || 'unknown',
  }));

  return c.json({ ok: true, entries, total });
});

app.get('/export', async (c) => {
  const rows = await db
    .select({
      email: schema.subscribers.email,
      createdAt: schema.subscribers.createdAt,
      source: schema.subscribers.source,
    })
    .from(schema.subscribers)
    .orderBy(desc(schema.subscribers.createdAt));

  const lines = ['email,timestamp,source'];
  for (const r of rows) {
    const email = r.email.includes(',') ? '"' + r.email.replace(/"/g, '""') + '"' : r.email;
    const src = (r.source || '').includes(',') ? '"' + (r.source || '').replace(/"/g, '""') + '"' : (r.source || '');
    const ts = r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt;
    lines.push(`${email},${ts},${src}`);
  }

  return new Response(lines.join('\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="herzblatt-subscribers-${new Date().toISOString().slice(0,10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
});

export default app;
```

---

## Task 8: Herzraum /readers/list

**Files:**
- Create: `apps/backend/src/routes/herzraum/readers-list.ts`

**Quellreferenz:** `apps/frontend/src/pages/api/herzraum/readers/list.ts` (überschneidet mit newsletter.list um email-Overlap zu berechnen).

**Inhalt:**

```ts
import { Hono } from 'hono';
import { desc } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';

const app = new Hono();

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  return `${local.slice(0, 1)}***@${domain}`;
}

app.get('/', async (c) => {
  const mask = c.req.query('mask') !== 'false';

  const [regs, nlEmails] = await Promise.all([
    db
      .select({
        email: schema.registrations.email,
        createdAt: schema.registrations.createdAt,
        source: schema.registrations.source,
      })
      .from(schema.registrations)
      .orderBy(desc(schema.registrations.createdAt))
      .limit(1000),
    db
      .select({ email: schema.subscribers.email })
      .from(schema.subscribers),
  ]);

  const nlSet = new Set(nlEmails.map(e => e.email.toLowerCase()));
  let overlap = 0;
  const entries = regs.map(r => {
    const isNl = nlSet.has(r.email.toLowerCase());
    if (isNl) overlap++;
    return {
      email: mask ? maskEmail(r.email) : r.email,
      ts: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
      source: r.source || 'unknown',
      newsletter: isNl,
    };
  });

  return c.json({ ok: true, entries, total: regs.length, overlap });
});

export default app;
```

---

## Task 9: Herzraum /data/export + /data/clear

**Files:**
- Create: `apps/backend/src/routes/herzraum/data.ts`

**Inhalt:**

```ts
import { Hono } from 'hono';
import { z } from 'zod';
import { db, schema } from '../../db/index.js';

const app = new Hono();

app.get('/export', async (c) => {
  const [pageviews, clicks, registrations, subscribers] = await Promise.all([
    db.select().from(schema.pageviews),
    db.select().from(schema.clicks),
    db.select().from(schema.registrations),
    db.select().from(schema.subscribers),
  ]);

  const bundle = {
    exportedAt: new Date().toISOString(),
    pageviews,
    clicks,
    registrations,
    newsletter: subscribers.map(s => ({
      timestamp: s.createdAt,
      email: s.email,
      source: s.source,
      user_agent: s.userAgent || '',
      ip_hash: s.ipHash || '',
    })),
  };

  return new Response(JSON.stringify(bundle, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="herzraum-export-${new Date().toISOString().slice(0,10)}.json"`,
      'Cache-Control': 'no-store',
    },
  });
});

const clearSchema = z.object({
  target: z.enum(['pageviews', 'clicks', 'registrations', 'daily-stats']),
});

app.post('/clear', async (c) => {
  const ct = c.req.header('content-type') || '';
  if (!ct.includes('application/json')) {
    return c.json({ ok: false, message: 'Invalid content type.' }, 400);
  }

  let body: unknown;
  try { body = await c.req.json(); }
  catch { return c.json({ ok: false, message: 'Ungültige Daten.' }, 400); }

  const parsed = clearSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, message: 'Unbekannter Datentyp.' }, 400);
  }

  try {
    switch (parsed.data.target) {
      case 'pageviews':
        await db.delete(schema.pageviews);
        break;
      case 'clicks':
        await db.delete(schema.clicks);
        break;
      case 'registrations':
        await db.delete(schema.registrations);
        break;
      case 'daily-stats':
        // Gibt keine daily-stats-tabelle in der DB — no-op
        break;
    }
    return c.json({ ok: true, cleared: parsed.data.target });
  } catch (err) {
    console.error('[data/clear] db error:', err);
    return c.json({ ok: false, message: 'Fehler beim Löschen.' }, 500);
  }
});

export default app;
```

---

## Task 10: Herzraum /password/verify

**Files:**
- Create: `apps/backend/src/routes/herzraum/password-verify.ts`

**Inhalt:**

```ts
import { Hono } from 'hono';
import { z } from 'zod';
import { verifyCurrentPassword } from '../../lib/session.js';

const app = new Hono();

const bodySchema = z.object({
  password: z.string().min(1).max(256),
});

app.post('/', async (c) => {
  const ct = c.req.header('content-type') || '';
  if (!ct.includes('application/json')) {
    return c.json({ ok: false }, 400);
  }
  let body: unknown;
  try { body = await c.req.json(); }
  catch { return c.json({ ok: false }, 400); }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false }, 400);

  const ok = verifyCurrentPassword(parsed.data.password);
  return c.json({ ok }, ok ? 200 : 401);
});

export default app;
```

**Commit (Tasks 5-10):**

```bash
cd /tmp/herzblatt-deploy
pnpm --filter @herzblatt/backend exec tsc --noEmit
git add apps/backend/src/routes/herzraum/
git commit -m "feat(backend): Herzraum-Admin-Routes portiert

- GET /herzraum/stats — aggregate KPIs, top-10, daily charts, recent activity
- GET /herzraum/clicks/sources — top quell-artikel für affiliate-klicks
- GET /herzraum/newsletter/list — maskiert / ?mask=false voller Export
- GET /herzraum/newsletter/export — CSV-Export volle E-Mails
- GET /herzraum/readers/list — mit Newsletter-Overlap-Count
- GET /herzraum/data/export — JSON-Bundle alle Daten
- POST /herzraum/data/clear — Target whitelist (pageviews/clicks/registrations)
- POST /herzraum/password/verify — check current password

Alle Aggregations via Drizzle SQL (count, groupBy, orderBy, dateTrunc via sql\`\`)."
```

---

## Task 11: Admin-CSV-Route mit Bearer-Token

**Files:**
- Create: `apps/backend/src/routes/admin/subscribers-csv.ts`

**Inhalt:**

```ts
import { Hono } from 'hono';
import { desc } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';

const app = new Hono();

app.get('/', async (c) => {
  const rows = await db
    .select({
      email: schema.subscribers.email,
      createdAt: schema.subscribers.createdAt,
      source: schema.subscribers.source,
      userAgent: schema.subscribers.userAgent,
      ipHash: schema.subscribers.ipHash,
    })
    .from(schema.subscribers)
    .orderBy(desc(schema.subscribers.createdAt));

  const lines = ['timestamp,email,source,user_agent,ip_hash'];
  for (const r of rows) {
    const ts = r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt;
    const esc = (v: string | null | undefined) => {
      if (!v) return '';
      if (/[",\n\r]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
      return v;
    };
    lines.push([ts, r.email, r.source || '', esc(r.userAgent), r.ipHash || ''].map(v => esc(String(v))).join(','));
  }

  return new Response(lines.join('\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="subscribers.csv"',
      'Cache-Control': 'no-store',
    },
  });
});

export default app;
```

---

## Task 12: index.ts — alle neuen Routes mounten + Auth-Guard

**Files:**
- Modify: `apps/backend/src/index.ts`

**Inhalt (vollständige neue Version):**

```ts
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

// Public Routes
import pageviewRoute from './routes/pageview.js';
import trackClickRoute from './routes/track-click.js';
import newsletterRoute from './routes/newsletter.js';
import registerRoute from './routes/register.js';
import readersRoute from './routes/readers.js';

// Auth Routes (semi-public)
import authRoute from './routes/auth.js';

// Admin Routes (session-protected)
import herzraumStatsRoute from './routes/herzraum/stats.js';
import herzraumClicksSourcesRoute from './routes/herzraum/clicks-sources.js';
import herzraumNewsletterRoute from './routes/herzraum/newsletter.js';
import herzraumReadersListRoute from './routes/herzraum/readers-list.js';
import herzraumDataRoute from './routes/herzraum/data.js';
import herzraumPasswordVerifyRoute from './routes/herzraum/password-verify.js';

// Admin Routes (bearer-token-protected)
import adminSubscribersCsvRoute from './routes/admin/subscribers-csv.js';

// Middleware
import { requireSession, requireAdminToken } from './lib/auth-middleware.js';

const app = new Hono();

app.use('*', cors({
  origin: (process.env.ALLOWED_ORIGINS || 'http://localhost:4321').split(',').map(s => s.trim()),
  credentials: true,
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600,
}));

// Health + Root
app.get('/health', (c) => c.json({ ok: true, service: 'herzblatt-backend', ts: new Date().toISOString() }));
app.get('/', (c) => c.text('Herzblatt Backend API — siehe /health'));

// Public API Routes
app.route('/pageview', pageviewRoute);
app.route('/track-click', trackClickRoute);
app.route('/newsletter', newsletterRoute);
app.route('/register', registerRoute);
app.route('/readers', readersRoute);

// Auth Routes (login/logout/verify — eigene security, keine middleware nötig)
app.route('/auth', authRoute);

// Herzraum Routes — ALLE protected by cookie session
app.use('/herzraum/*', requireSession);
app.route('/herzraum/stats', herzraumStatsRoute);
app.route('/herzraum/clicks/sources', herzraumClicksSourcesRoute);
app.route('/herzraum/newsletter', herzraumNewsletterRoute);
app.route('/herzraum/readers/list', herzraumReadersListRoute);
app.route('/herzraum/data', herzraumDataRoute);
app.route('/herzraum/password/verify', herzraumPasswordVerifyRoute);

// Admin Routes — bearer token
app.use('/admin/*', requireAdminToken);
app.route('/admin/subscribers.csv', adminSubscribersCsvRoute);

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

**Typecheck + Build + Commit:**

```bash
cd /tmp/herzblatt-deploy
pnpm --filter @herzblatt/backend exec tsc --noEmit
pnpm --filter @herzblatt/backend build 2>&1 | tail -5
git add apps/backend/src/index.ts apps/backend/src/routes/admin/
git commit -m "feat(backend): alle Herzraum + Admin Routes gemounted mit auth-middleware

- /herzraum/* requires cookie session (requireSession middleware)
- /admin/* requires Bearer token (requireAdminToken middleware)"
```

---

## Task 13: Lokaler Smoke-Test (Login-Flow + Stats)

**Voraussetzung:** `.env` in `apps/backend/` hat `HERZRAUM_PASSWORD=bzVSAuyQ5RMpOsbR2xJ9HDxJ`, `IP_SALT=f23d4acb781c822516e8c63e0a94474a`, `ADMIN_TOKEN=575862173bd7f57815a93a5a0a936ef3ed0c9dc2dfc56022be5244c75c3b8fe2`, `DATABASE_URL=postgresql://...`

**Step 1: .env ergänzen (falls nötig)**

```bash
cd /tmp/herzblatt-deploy
grep -q HERZRAUM_PASSWORD apps/backend/.env || cat >> apps/backend/.env <<EOF
HERZRAUM_PASSWORD=bzVSAuyQ5RMpOsbR2xJ9HDxJ
IP_SALT=f23d4acb781c822516e8c63e0a94474a
ADMIN_TOKEN=575862173bd7f57815a93a5a0a936ef3ed0c9dc2dfc56022be5244c75c3b8fe2
EOF
```

**Step 2: Backend starten**

```bash
pnpm --filter @herzblatt/backend dev > /tmp/be.log 2>&1 &
sleep 4
cat /tmp/be.log | head -10
```

**Step 3: Auth-Flow testen**

```bash
BASE=http://localhost:3001
echo "=== Wrong password ==="
curl -s -X POST $BASE/auth/login -H "Content-Type: application/json" -d '{"password":"wrong"}'; echo
echo "=== Correct password (saves cookie) ==="
curl -s -c /tmp/cookies.txt -X POST $BASE/auth/login -H "Content-Type: application/json" -d '{"password":"bzVSAuyQ5RMpOsbR2xJ9HDxJ"}'; echo
echo "=== /auth/verify with cookie ==="
curl -s -b /tmp/cookies.txt $BASE/auth/verify; echo
echo "=== /herzraum/stats with cookie ==="
curl -s -b /tmp/cookies.txt "$BASE/herzraum/stats?range=7d" | python3 -m json.tool | head -20
echo "=== /herzraum/stats WITHOUT cookie (should 401) ==="
curl -s -w "\nHTTP %{http_code}\n" $BASE/herzraum/stats
echo "=== /admin/subscribers.csv with bearer ==="
curl -s -w "\nHTTP %{http_code}\n" -H "Authorization: Bearer 575862173bd7f57815a93a5a0a936ef3ed0c9dc2dfc56022be5244c75c3b8fe2" $BASE/admin/subscribers.csv | head -5
echo "=== Logout ==="
curl -s -b /tmp/cookies.txt -c /tmp/cookies.txt -X POST $BASE/auth/logout; echo
echo "=== /auth/verify after logout (should be 401) ==="
curl -s -b /tmp/cookies.txt -w "\nHTTP %{http_code}\n" $BASE/auth/verify
```

Expected:
- Wrong password: `{"ok":false,"message":"Anmeldung fehlgeschlagen."}`
- Correct: `{"ok":true,"redirect":"/herzraum"}` + Set-Cookie in `/tmp/cookies.txt`
- Verify: `{"ok":true}`
- Stats: JSON mit kpis.pageviews usw.
- Stats ohne cookie: `{"error":"Unauthorized"}` HTTP 401
- Admin CSV: CSV-Output, erste Zeilen
- Logout: `{"ok":true}`
- Verify nach logout: HTTP 401

**Step 4: Backend killen**

```bash
pkill -f "tsx watch src/index.ts" 2>/dev/null
sleep 1
```

---

## Task 14: Merge + Push + Deploy

```bash
cd /tmp/herzblatt-deploy
git log --oneline refactor/phase-1d-auth-admin ^main

git checkout main
git merge --no-ff refactor/phase-1d-auth-admin -m "Merge: Phase 1d — Auth + Herzraum Admin-Routes im Backend

Backend hat jetzt komplettes Herzraum-API:
- Auth: /auth/login, /logout, /verify (Cookie-Session, 24h TTL)
- Session-Management via sessions-Tabelle, Rate-Limit via login_attempts
- /herzraum/* (cookie-protected): stats, clicks/sources, newsletter/list+export,
  readers/list, data/export+clear, password/verify
- /admin/* (bearer-protected): subscribers.csv (für pull-subscribers.sh)

Lokaler Smoke-Test bestanden: login-flow, stats-query, bearer-auth, logout."

git push origin main 2>&1 | tail -3
```

**Manual Railway-Deploy** (nötig wegen Webhook-Auto-Deploy-Probleme aus Phase 1c):

```bash
TOKEN=<neuer Railway-Token>
FULL_HASH=$(git rev-parse HEAD)
curl -sS -X POST https://backboard.railway.app/graphql/v2 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"mutation { serviceInstanceDeployV2(serviceId: \\\"74114171-75cf-4887-ab82-92bd5a1d6478\\\", environmentId: \\\"a963e080-5126-44ed-8006-f3660e0d558d\\\", commitSha: \\\"$FULL_HASH\\\") }\"}"
```

---

## Task 15: Live-Verifikation

```bash
BASE=https://backend-production-c327.up.railway.app

echo "=== /health ===" && curl -s $BASE/health; echo
echo "=== Login ===" && curl -s -c /tmp/live-cookies.txt -X POST $BASE/auth/login -H "Content-Type: application/json" -d '{"password":"bzVSAuyQ5RMpOsbR2xJ9HDxJ"}'; echo
echo "=== /herzraum/stats (cookie) ===" && curl -s -b /tmp/live-cookies.txt $BASE/herzraum/stats | python3 -m json.tool | head -10
echo "=== /admin/subscribers.csv (bearer) ===" && curl -s -H "Authorization: Bearer 575862173bd7f57815a93a5a0a936ef3ed0c9dc2dfc56022be5244c75c3b8fe2" $BASE/admin/subscribers.csv | head -3
echo "=== Logout ===" && curl -s -b /tmp/live-cookies.txt -X POST $BASE/auth/logout; echo
```

Alle Calls müssen sinnvolle JSON/CSV zurückgeben, keine 5xx.

---

## Phase 1d abgeschlossen — was jetzt funktioniert

- ✅ Vollständiges Auth-System auf Backend (session in DB, rate-limit)
- ✅ Alle `/herzraum/*` Endpoints live, cookie-protected
- ✅ `/admin/subscribers.csv` via Bearer-Token zugreifbar
- ✅ Frontend-Side-Code (`apps/frontend/src/pages/api/herzraum/*`) kann in Phase 1f
  durch Proxies zum Backend ersetzt werden

## Nicht in Phase 1d

- Legacy-Daten-Import (Phase 1e — `data/subscribers.csv` → Postgres)
- Frontend-Umbiegung (Phase 1f — fetch-Calls auf `api.herzblatt-journal.com`)
- Herzraum-HTML-Pages berühren (bleiben im Astro-Frontend)

## Rollback

```bash
git revert HEAD --no-edit
git push origin main
# Railway re-deploy via GraphQL mit vorherigem commit
```
