# Phase 1a: Backend-Scaffold + Drizzle-Schema Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Leeres `apps/backend/` zu einem lokal lauffähigen Hono-Server mit Drizzle-Schema aufbauen — inklusive `/health`-Route, TypeScript-Build-Pipeline und Dev-Watcher. Noch KEIN Railway-Deploy, KEINE Routen außer `/health`.

**Architecture:** Hono-Server als ES-Module auf Node 22, Drizzle-ORM (Postgres-Dialect), TypeScript mit `tsx` für Dev und `tsc` für Build. Schema in einer zentralen Datei (`src/db/schema.ts`), Drizzle-Client in `src/db/index.ts`, modulare Routen-Struktur.

**Tech Stack:** Hono, @hono/node-server, Drizzle ORM, drizzle-kit, postgres (pg-Client), zod, tsx, typescript.

**Reference:** Design-Doc `docs/plans/2026-04-17-backend-split-design.md`, speziell Abschnitt 3 (Datenbank-Schema).

**Vorbedingungen:** Phase 0 komplett durch (Monorepo steht), pnpm installed, `/tmp/herzblatt-deploy` ist fresh clone auf `main`.

---

## Task 1: Fresh Clone und Branch

**Files:** keine Änderung — nur git state.

**Step 1: Sauberer Arbeits-Ordner**

```bash
cd /tmp && [ -d herzblatt-deploy ] || { echo "Expected /tmp/herzblatt-deploy"; exit 1; }
cd /tmp/herzblatt-deploy
git status
git log --oneline -1
```

Expected: Clean state, letzter Commit `df7a2bc docs(plans): Phase 1 Handoff` oder neuer.

**Step 2: Feature-Branch anlegen**

```bash
git checkout -b refactor/phase-1a-backend-scaffold
```

Expected: `Switched to a new branch 'refactor/phase-1a-backend-scaffold'`.

---

## Task 2: Backend-Dependencies installieren

**Files:**
- Modify: `apps/backend/package.json`

**Step 1: Aktuelle backend/package.json anschauen**

```bash
cat apps/backend/package.json
```

**Step 2: package.json mit Dependencies neu schreiben**

Inhalt:

```json
{
  "name": "@herzblatt/backend",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "db:generate": "drizzle-kit generate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio"
  },
  "dependencies": {
    "hono": "^4.9.8",
    "@hono/node-server": "^1.18.0",
    "drizzle-orm": "^0.37.0",
    "postgres": "^3.4.5",
    "zod": "^3.24.1",
    "dotenv": "^16.4.7"
  },
  "devDependencies": {
    "@types/node": "^22.10.5",
    "drizzle-kit": "^0.30.1",
    "tsx": "^4.19.2",
    "typescript": "^5.7.3"
  }
}
```

**Step 3: Install**

```bash
pnpm install
```

Expected: Kein Fehler, `apps/backend/node_modules/` enthält die neuen Pakete.

**Step 4: Verifizieren**

```bash
pnpm --filter @herzblatt/backend list hono drizzle-orm tsx typescript 2>&1 | head -10
```

Expected: Versionen werden aufgelistet.

**Step 5: Commit**

```bash
git add apps/backend/package.json pnpm-lock.yaml
git commit -m "build(backend): Hono + Drizzle + tsx dependencies installiert"
```

---

## Task 3: TypeScript-Konfiguration

**Files:**
- Create: `apps/backend/tsconfig.json`

**Step 1: tsconfig schreiben**

Inhalt:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "types": ["node"],
    "strict": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": false,
    "sourceMap": true,
    "allowImportingTsExtensions": false,
    "noEmit": false
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 2: Verifizieren**

```bash
pnpm --filter @herzblatt/backend exec tsc --noEmit --project apps/backend/tsconfig.json 2>&1 | head -5
```

Expected: Kein Output (kein Fehler) oder Fehler wegen fehlender Input-Files — beides OK an diesem Punkt.

---

## Task 4: Minimaler Hono-Server mit /health

**Files:**
- Create: `apps/backend/src/index.ts`

**Step 1: index.ts schreiben**

Inhalt:

```ts
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono();

// CORS — nur Frontend + localhost erlauben
app.use('*', cors({
  origin: (process.env.ALLOWED_ORIGINS || 'http://localhost:4321').split(',').map(s => s.trim()),
  credentials: true,
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600,
}));

// Health-Check für Railway + Monitoring
app.get('/health', (c) => c.json({ ok: true, service: 'herzblatt-backend', ts: new Date().toISOString() }));

// Root
app.get('/', (c) => c.text('Herzblatt Backend API — siehe /health'));

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

Expected: Kein Output (bedeutet: keine TypeScript-Fehler).

**Step 3: Dev-Server kurz starten**

```bash
# Background starten, dann curl, dann killen
cd /tmp/herzblatt-deploy
pnpm --filter @herzblatt/backend dev &
BACKEND_PID=$!
sleep 3
curl -s http://localhost:3001/health
echo ""
kill $BACKEND_PID 2>/dev/null || true
wait $BACKEND_PID 2>/dev/null || true
```

Expected Output:
```
{"ok":true,"service":"herzblatt-backend","ts":"2026-..."}
```

Falls das klappt: **Hono läuft lokal**. 🎉

**Step 4: Build-Test**

```bash
cd /tmp/herzblatt-deploy
pnpm --filter @herzblatt/backend build
ls apps/backend/dist/
```

Expected: `apps/backend/dist/index.js` existiert, kein tsc-Fehler.

**Step 5: Start-Test (aus Build-Output)**

```bash
cd /tmp/herzblatt-deploy
pnpm --filter @herzblatt/backend start &
BACKEND_PID=$!
sleep 2
curl -s http://localhost:3001/health
echo ""
kill $BACKEND_PID 2>/dev/null || true
wait $BACKEND_PID 2>/dev/null || true
```

Expected: Gleicher JSON-Response wie Step 3 — Production-Build funktioniert.

**Step 6: Commit**

```bash
git add apps/backend/tsconfig.json apps/backend/src/index.ts
git commit -m "feat(backend): minimaler Hono-Server mit /health + CORS"
```

---

## Task 5: Drizzle-Konfiguration

**Files:**
- Create: `apps/backend/drizzle.config.ts`
- Create: `apps/backend/.env.example`

**Step 1: drizzle.config.ts**

Inhalt:

```ts
import 'dotenv/config';
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://localhost:5432/herzblatt_dev',
  },
  verbose: true,
  strict: true,
} satisfies Config;
```

**Step 2: .env.example**

Inhalt:

```
# Lokale Entwicklung
DATABASE_URL=postgresql://localhost:5432/herzblatt_dev
PORT=3001
HOST=0.0.0.0
ALLOWED_ORIGINS=http://localhost:4321

# Herzraum-Auth (aus Frontend-ENV übernehmen wenn Phase 1f zu Railway pushed)
HERZRAUM_PASSWORD=
IP_SALT=
ADMIN_TOKEN=

# External Proxy (Phase 1c)
REGISTER_API_URL=https://be.xloves.com/api/auth/register
```

**Step 3: Verifizieren**

```bash
cat apps/backend/drizzle.config.ts
cat apps/backend/.env.example
```

Expected: Beide Files existieren mit obigem Inhalt.

---

## Task 6: Drizzle-Schema mit 7 Tabellen

**Files:**
- Create: `apps/backend/src/db/schema.ts`

**Step 1: Schema schreiben — alle 7 Tabellen aus dem Design-Doc**

Inhalt:

```ts
import {
  pgTable,
  serial,
  text,
  timestamp,
  boolean,
  bigint,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * Pageviews — ein Event pro Zeile.
 * Aggregationen (Top Articles, Daily Counts) werden on-the-fly berechnet.
 */
export const pageviews = pgTable(
  'pageviews',
  {
    id: serial('id').primaryKey(),
    ts: timestamp('ts', { withTimezone: true }).defaultNow().notNull(),
    path: text('path').notNull(),
    referrer: text('referrer').default('direct'),
    ua: text('ua'),
  },
  (t) => ({
    tsIdx: index('pageviews_ts_idx').on(t.ts),
    pathTsIdx: index('pageviews_path_ts_idx').on(t.path, t.ts),
  }),
);

/**
 * Clicks — Affiliate-Tracking.
 * target ist gegen Whitelist in der API validiert.
 */
export const clicks = pgTable(
  'clicks',
  {
    id: serial('id').primaryKey(),
    ts: timestamp('ts', { withTimezone: true }).defaultNow().notNull(),
    target: text('target').notNull(),
    source: text('source').default('unknown'),
    type: text('type').default('affiliate'),
  },
  (t) => ({
    tsIdx: index('clicks_ts_idx').on(t.ts),
    targetTsIdx: index('clicks_target_ts_idx').on(t.target, t.ts),
    sourceTsIdx: index('clicks_source_ts_idx').on(t.source, t.ts),
  }),
);

/**
 * Subscribers — Newsletter (ersetzt subscribers.csv).
 * sendgrid_id ist für späteren SendGrid-Sync vorbereitet.
 */
export const subscribers = pgTable(
  'subscribers',
  {
    id: serial('id').primaryKey(),
    email: text('email').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    source: text('source').default('unknown'),
    ipHash: text('ip_hash'),
    userAgent: text('user_agent'),
    unsubscribedAt: timestamp('unsubscribed_at', { withTimezone: true }),
    sendgridId: text('sendgrid_id'),
  },
  (t) => ({
    createdAtIdx: index('subscribers_created_at_idx').on(t.createdAt),
  }),
);

/**
 * Registrations — xLoves-Signups, die durchgingen.
 */
export const registrations = pgTable(
  'registrations',
  {
    id: serial('id').primaryKey(),
    email: text('email').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    source: text('source').default('unknown'),
  },
  (t) => ({
    createdAtIdx: index('registrations_created_at_idx').on(t.createdAt),
    emailIdx: index('registrations_email_idx').on(t.email),
  }),
);

/**
 * Sessions — Herzraum-Admin-Sessions.
 * Opaque token → SHA-256-hash in token_hash. 24h TTL.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: serial('id').primaryKey(),
    tokenHash: text('token_hash').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipHash: text('ip_hash'),
  },
  (t) => ({
    expiresAtIdx: index('sessions_expires_at_idx').on(t.expiresAt),
  }),
);

/**
 * LoginAttempts — Rate-Limit für Herzraum-Login.
 * Cleanup >7 Tage optional (low priority).
 */
export const loginAttempts = pgTable(
  'login_attempts',
  {
    id: serial('id').primaryKey(),
    ipHash: text('ip_hash').notNull(),
    ts: timestamp('ts', { withTimezone: true }).defaultNow().notNull(),
    success: boolean('success').notNull(),
  },
  (t) => ({
    ipHashTsIdx: index('login_attempts_ip_hash_ts_idx').on(t.ipHash, t.ts),
  }),
);

/**
 * ReadersCounter — Fake-Counter für Homepage.
 * Einzige Row mit id=1.
 */
export const readersCounter = pgTable('readers_counter', {
  id: serial('id').primaryKey(),
  count: bigint('count', { mode: 'number' }).default(12847).notNull(),
  lastUpdated: timestamp('last_updated', { withTimezone: true }).defaultNow().notNull(),
});
```

**Step 2: Typecheck**

```bash
cd /tmp/herzblatt-deploy
pnpm --filter @herzblatt/backend exec tsc --noEmit
```

Expected: Kein Fehler.

---

## Task 7: Drizzle-Client

**Files:**
- Create: `apps/backend/src/db/index.ts`

**Step 1: DB-Client mit postgres.js**

Inhalt:

```ts
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL ist nicht gesetzt (siehe .env.example)');
}

// postgres.js client — connection pooling built-in
const queryClient = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(queryClient, { schema });
export { schema };
```

**Step 2: Typecheck**

```bash
cd /tmp/herzblatt-deploy
pnpm --filter @herzblatt/backend exec tsc --noEmit
```

Expected: Kein Fehler.

**Step 3: Commit**

```bash
git add apps/backend/drizzle.config.ts apps/backend/.env.example apps/backend/src/db/schema.ts apps/backend/src/db/index.ts
git commit -m "feat(backend): Drizzle-Schema (7 Tables) + Postgres-Client + .env.example"
```

---

## Task 8: Migration generieren (nur Files, noch kein DB-Push)

**Files:**
- Create: `apps/backend/src/db/migrations/*.sql` (generated)

**Step 1: Migration generieren**

```bash
cd /tmp/herzblatt-deploy
DATABASE_URL='postgresql://localhost:5432/herzblatt_dev_phantom' \
  pnpm --filter @herzblatt/backend db:generate
```

**Hinweis:** `DATABASE_URL` hier ist ein **Phantom-URL** — wir wollen nur die SQL-Files generieren, nicht gegen eine reale DB pushen. Drizzle-kit versucht **nicht** zu connecten bei `generate`.

Expected:
- `apps/backend/src/db/migrations/0000_*.sql` existiert
- `apps/backend/src/db/migrations/meta/` existiert mit snapshot

**Step 2: SQL anschauen**

```bash
cat apps/backend/src/db/migrations/0000_*.sql | head -50
```

Expected: SQL mit `CREATE TABLE pageviews ...`, `CREATE INDEX ...` für alle 7 Tabellen.

**Step 3: Commit**

```bash
git add apps/backend/src/db/migrations/
git commit -m "feat(backend): initial Drizzle-Migration generiert"
```

---

## Task 9: .gitignore aktualisieren

**Files:**
- Modify: `/tmp/herzblatt-deploy/.gitignore`

**Step 1: Backend-spezifische Ignore-Regeln hinzufügen**

Existierende `.gitignore` lesen und prüfen, ob folgendes ergänzt werden muss:

- `apps/backend/.env` (lokales ENV-File, niemals committen)
- `apps/backend/dist/` (Build-Output — evtl. bereits via `apps/*/dist/` gitignored, check)

Wenn nicht gitignored:

```
# Backend
apps/backend/.env
```

**Step 2: Verifizieren**

```bash
git check-ignore -v apps/backend/.env 2>&1 || echo "not ignored"
```

Expected: ignored.

**Step 3: Commit (falls geändert)**

```bash
git add .gitignore
git commit -m "chore(gitignore): apps/backend/.env ausschließen"
```

---

## Task 10: Merge zurück zu main + Push

**Step 1: Summary der Commits auf dem Branch**

```bash
cd /tmp/herzblatt-deploy
git log --oneline refactor/phase-1a-backend-scaffold ^main
```

Expected: 4-5 Commits aus Tasks 2, 4, 7, 8, 9.

**Step 2: Merge zu main**

```bash
git checkout main
git merge --no-ff refactor/phase-1a-backend-scaffold -m "Merge: Phase 1a — Backend-Scaffold (Hono + Drizzle + Schema)

Apps/backend/ hat jetzt:
- Hono-Server mit /health + CORS
- Drizzle-ORM mit 7-Tabellen-Schema
- Migration-SQL generiert
- tsc/tsx Build-Pipeline
- .env.example mit allen nötigen Vars

Noch NICHT: Railway-Deploy, Postgres-Service, Routen-Migration. Das
kommt in Phase 1b-1f — siehe docs/plans/2026-04-17-phase-1-handoff.md."
```

**Step 3: Push**

```bash
git push origin main 2>&1 | tail -3
```

Expected: `main -> main` mit neuem Commit-Hash.

**Hinweis:** Dieser Push triggert **keinen Railway-Rebuild für das Frontend**, weil:
- Railway hat rootDirectory=`apps/frontend`
- Änderungen in `apps/backend/` und `packages/shared/` werden ignoriert
- Live-Frontend bleibt stabil

---

## Phase 1a abgeschlossen — was jetzt funktioniert

- ✅ `apps/backend/` ist ein lauffähiges TypeScript-Projekt
- ✅ `pnpm --filter @herzblatt/backend dev` startet Hono auf `http://localhost:3001`
- ✅ `curl http://localhost:3001/health` → `{"ok":true,...}`
- ✅ `pnpm --filter @herzblatt/backend build` erzeugt `dist/index.js`
- ✅ Drizzle-Schema definiert, Initial-Migration als SQL generiert
- ✅ Keine Railway-Änderung, Live-Frontend stabil

## Nächster Schritt (Phase 1b)

- Railway: Postgres-Service anlegen
- `DATABASE_URL` als ENV vom Postgres-Reference auf Backend-Service (noch nicht angelegt)
- Erste Migration gegen live-Postgres pushen (`db:push`)
- Smoke-Test DB-Connection

Plan-Datei: `docs/plans/2026-04-17-phase-1b-railway-postgres.md` (noch zu schreiben, in neuer Session oder später in dieser).

## Rollback-Notfall

Falls Phase 1a etwas kaputt macht:

```bash
cd /tmp/herzblatt-deploy
git revert HEAD --no-edit
git push origin main
```

Railway bemerkt das nicht (apps/backend/ ist nicht in rootDirectory), Frontend bleibt unverändert.
