# Backend-Split Design — Herzblatt-Journal

**Datum:** 2026-04-17
**Status:** Approved
**Entscheider:** Andrej Feldhinkel
**Umsetzer:** Claude Code

---

## Problem-Statement

Der aktuelle Astro-SSR-Monolith auf Railway hat zwei strukturelle Probleme:

1. **Deploy-Zeit blockiert parallele Arbeit.** Ein Commit — egal ob API-Fix oder Artikel-Typo — triggert einen ~7-Min-Rebuild aller 2400+ Pages. Backend- und Frontend-Arbeit lassen sich nicht sinnvoll parallelisieren.
2. **Ephemere Persistenz.** Alle Tracking-Daten in `data/*.json` werden bei jedem Git-Push gelöscht. Pageviews, Klicks, Sessions, Registrierungen verschwinden mit jedem Deploy. Nur die separat abgepullte Newsletter-CSV überlebt.

## Ziele

- Backend-Deploys unabhängig vom Frontend (Zielzeit: < 90s)
- Persistente Datenhaltung (Deploys zerstören keine Daten mehr)
- Shared Types zwischen Services ohne npm-Publish-Zyklus
- Skalierungs-Freiheit: Backend-Last beeinflusst Blog-Rendering nicht
- Vorbereitung für spätere SendGrid-Integration (Schema bereits passend)

## Nicht-Ziele (YAGNI)

- Railway verlassen / eigener VPS
- Dashboard (Herzraum) als dritter Service
- Stateless JWT (stateful Session bleibt, wegen Invalidierbarkeit)
- Monitoring/APM/Grafana
- Redis / externer Rate-Limit-Store
- GraphQL / RPC / tRPC
- CI außerhalb Railway's built-in
- User-Accounts als DB-Entity (Registrierung bleibt externer Proxy zu xLoves)

---

## Architektur-Überblick

```
         ┌─────────────────────────────────────┐
         │      herzblatt-journal.com          │
         │       (Frontend Service)            │
         │   Astro SSR, Blog, Herzraum-UI      │
         │    Deploy-Zeit: ~7 min (unchanged)  │
         └──────────────┬──────────────────────┘
                        │ fetch (+ Cookie)
                        ▼
         ┌─────────────────────────────────────┐
         │      api.herzblatt-journal.com      │
         │        (Backend Service)            │
         │   Hono auf Node, alle API-Routen    │
         │    Deploy-Zeit: ~30–60 s            │
         └──────────────┬──────────────────────┘
                        │ DATABASE_URL (intern)
                        ▼
         ┌─────────────────────────────────────┐
         │       Railway Postgres              │
         │ pageviews · clicks · subscribers    │
         │ registrations · sessions · …        │
         └─────────────────────────────────────┘
```

---

## Monorepo-Struktur

Ein GitHub-Repo (`herzblatt-journal`), pnpm-Workspaces:

```
herzblatt-journal/
├── pnpm-workspace.yaml          # packages: apps/*, packages/*
├── package.json                 # root — dev-Skripte
├── apps/
│   ├── frontend/                # Astro (bisheriger Code)
│   │   ├── astro.config.mjs
│   │   ├── src/
│   │   ├── public/
│   │   └── package.json
│   └── backend/                 # NEU — Hono
│       ├── src/
│       │   ├── index.ts
│       │   ├── routes/
│       │   ├── db/
│       │   ├── auth/
│       │   └── scripts/import-legacy.ts
│       ├── drizzle.config.ts
│       └── package.json
├── packages/
│   └── shared/                  # Shared Types (PageviewEvent, ClickEvent, …)
│       └── package.json
├── docs/
├── scripts/                     # pull-subscribers.sh bleibt
└── data/                        # Nach Migration nur noch Fallback
```

**Warum Monorepo statt 2 Repos:** Solo-Dev, Shared-Types ohne Publish-Zyklus, atomare Commits über FE/BE hinweg, ein `git clone`, ein `git push`. Railway kann aus demselben Repo zwei Services mit unterschiedlichen `rootDirectory`-Werten bauen.

---

## Tech-Stack (Backend)

| Layer | Wahl | Begründung |
|---|---|---|
| HTTP-Framework | **Hono** (Node-Adapter) | ~11 KB, TS-nativ, Syntax fast identisch zu Astro-API-Routes → Migration copy-paste-artig |
| ORM | **Drizzle** | Leichtgewichtig, SQL-nah, Migrations via `drizzle-kit` |
| DB | **Railway Postgres** | Ein-Klick-Template, intern mit Backend verdrahtet |
| Validation | **Zod** | Bereits im Astro-Kontext vertraut |
| JWT | `hono/jwt` | Built-in (nur für Service-Tokens, User-Sessions bleiben opaque) |
| Runtime | Node 22 | Bereits Railway-Standard |

**Nicht gewählt:** Express (veraltet), Fastify (zu viele Plugins nicht nötig), NestJS (Overkill), Prisma (Build-Step-Kosten), Astro als Backend (2×Astro ist seltsam).

---

## API-Migrations-Mapping

Alle `/api/*`-Endpoints wandern zum Backend. Die **HTML-Seiten unter `/herzraum/*`** bleiben im Astro-Frontend (Auto-Refresh-Daten kommen via Browser-Fetch vom Backend).

| Aktuell (Astro) | Neu (Backend) |
|---|---|
| `POST /api/newsletter` | `POST /newsletter` |
| `POST /api/pageview` | `POST /pageview` |
| `POST /api/track-click` | `POST /track-click` |
| `POST /api/register` | `POST /register` (proxy zu xLoves + DB-Insert) |
| `GET /api/readers` | `GET /readers` |
| `GET /api/admin/subscribers.csv` | `GET /admin/subscribers.csv` (Bearer-Auth) |
| `POST /api/herzraum/auth` `/logout` | `POST /auth/login` `/logout` `/verify` |
| `GET /api/herzraum/stats` | `GET /herzraum/stats` (Session-Auth) |
| `GET /api/herzraum/clicks/sources` | `GET /herzraum/clicks/sources` |
| `GET /api/herzraum/newsletter/list` | `GET /herzraum/newsletter/list` |
| `GET /api/herzraum/newsletter/export` | `GET /herzraum/newsletter/export` |
| `GET /api/herzraum/readers/list` | `GET /herzraum/readers/list` |
| `GET /api/herzraum/data/export` | `GET /herzraum/data/export` |
| `POST /api/herzraum/data/clear` | `POST /herzraum/data/clear` |
| `POST /api/herzraum/password/verify` | `POST /herzraum/password/verify` |

---

## Datenbank-Schema

Drizzle-Notation (vereinfacht):

```ts
pageviews {
  id         serial      PK
  ts         timestamptz DEFAULT now()
  path       text        NOT NULL
  referrer   text        DEFAULT 'direct'
  ua         text
  INDEX (ts DESC)
  INDEX (path, ts)
}

clicks {
  id         serial      PK
  ts         timestamptz DEFAULT now()
  target     text        NOT NULL
  source     text        DEFAULT 'unknown'
  type       text        DEFAULT 'affiliate'
  INDEX (ts DESC)
  INDEX (target, ts)
  INDEX (source, ts)
}

subscribers {
  id              serial      PK
  email           text        UNIQUE NOT NULL
  created_at      timestamptz DEFAULT now()
  source          text        DEFAULT 'unknown'
  ip_hash         text
  user_agent      text
  unsubscribed_at timestamptz
  sendgrid_id     text                          -- vorbereitend für SendGrid
  INDEX (created_at DESC)
  INDEX (email)
}

registrations {
  id         serial      PK
  email      text        NOT NULL
  created_at timestamptz DEFAULT now()
  source     text        DEFAULT 'unknown'
  INDEX (created_at DESC)
  INDEX (email)
}

sessions {
  id          serial      PK
  token_hash  text        UNIQUE NOT NULL
  created_at  timestamptz DEFAULT now()
  expires_at  timestamptz NOT NULL
  ip_hash     text
  INDEX (expires_at)
}

login_attempts {
  id       serial      PK
  ip_hash  text        NOT NULL
  ts       timestamptz DEFAULT now()
  success  boolean     NOT NULL
  INDEX (ip_hash, ts DESC)
}

readers_counter {
  id           serial      PK
  count        bigint      DEFAULT 12847
  last_updated timestamptz DEFAULT now()
}
```

**Skalierungs-Check:** 10 k Pageviews/Tag → 3.6 M Rows/Jahr. Postgres-Queries mit Index auf `(ts, path)` bleiben < 50 ms bis in den zweistelligen Millionenbereich.

---

## Auth-Modell

### Cookie-Strategie — Subdomain-scoped

```
Set-Cookie: hz_session=<opaque-token>;
            Domain=.herzblatt-journal.com;    ← Dot-Prefix
            HttpOnly; Secure;
            SameSite=Lax;
            Max-Age=86400
```

Der Dot-Prefix macht den Cookie auf Frontend + Backend-Subdomain sichtbar. `SameSite=Lax` (statt bisher `Strict`) reicht für Cross-Subdomain und erlaubt Cookie-Weitergabe bei fetch mit `credentials: 'include'`.

### Token bleibt stateful

Opaque Random-Bytes (32 Bytes base64url) im Cookie, SHA-256-Hash in `sessions`-Tabelle. Warum nicht JWT: invaliderbar, Passwort-Wechsel wirkt sofort, keine Secret-Rotation-Probleme.

### Drei Auth-Ebenen

| Scope | Wie | Endpoints |
|---|---|---|
| **Public** | Nur CORS + Rate-Limit | `POST /pageview`, `/track-click`, `/newsletter`, `/register`, `GET /readers` |
| **Admin-Session** | Cookie `hz_session` → Hash → DB-Lookup | Alle `/herzraum/*`-Endpoints |
| **Service-Token** | `Authorization: Bearer <ADMIN_TOKEN>` | `GET /admin/subscribers.csv` (für `pull-subscribers.sh`) |

### CORS-Config

```ts
cors({
  origin: ['https://herzblatt-journal.com', 'http://localhost:4321'],
  credentials: true,
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600,
})
```

### Frontend-Middleware

Astro-Middleware für `/herzraum/*`-HTML-Routes macht server-side Verify:

```ts
const res = await fetch(`${BACKEND_URL}/auth/verify`, {
  headers: { cookie: request.headers.get('cookie') || '' }
})
if (!res.ok) return redirect('/herzraum/login')
```

~10 ms extra pro Seiten-Load — akzeptabel.

---

## Deploy-Setup (Railway)

Ein Projekt, drei Services im selben Projekt:

```
Railway Project: herzblatt-journal
├─ frontend    (rootDirectory: apps/frontend, domain: herzblatt-journal.com)
├─ backend     (rootDirectory: apps/backend,  domain: api.herzblatt-journal.com)
└─ postgres    (Railway-Template, internal only)
```

**Alte Services löschen:** `zestful-fascination`, `function-bun` (Sleeping, ungenutzt).

### ENV-Variables

| Service | Variable | Quelle |
|---|---|---|
| **backend** | `DATABASE_URL` | Auto via Postgres-Reference |
| | `HERZRAUM_PASSWORD` | aus bestehender Frontend-ENV |
| | `IP_SALT` | aus bestehender ENV |
| | `ADMIN_TOKEN` | aus bestehender ENV |
| | `REGISTER_API_URL` | aus bestehender ENV |
| | `ALLOWED_ORIGINS` | `https://herzblatt-journal.com` |
| **frontend** | `BACKEND_URL` | `https://api.herzblatt-journal.com` |

Alle Herzraum-Auth-Vars (`HERZRAUM_PASSWORD`, `IP_SALT`) wandern vom Frontend zum Backend.

---

## Migrations-Plan (5 Phasen)

### Phase 0 — Monorepo-Umbau (keine Funktions-Änderung)

- `pnpm-workspace.yaml` anlegen
- Bestehenden Code nach `apps/frontend/` verschieben (nur Move)
- Leeres `apps/backend/` + `packages/shared/` Scaffold
- Frontend-Railway-Service: `rootDirectory` auf `apps/frontend` umstellen
- Deploy: Frontend weiter live, Backend noch nicht
- **Risiko:** null — nur Move-Operationen

### Phase 1 — Backend aufbauen (Frontend unverändert)

- Hono + Drizzle + Zod installieren
- Schema definieren, initial Migration via `drizzle-kit generate`
- Alle API-Routen implementieren (1:1 Port aus `apps/frontend/src/pages/api/`)
- Railway: Postgres-Template + Backend-Service anlegen, ENV setzen
- Custom Domain: `api.herzblatt-journal.com` als CNAME auf Railway
- **Smoke-Test:** `curl https://api.herzblatt-journal.com/health` → 200
- **Risiko:** gering — Backend ist parallel zu Astro-APIs

### Phase 2 — Daten-Migration

- Seed-Script `apps/backend/src/scripts/import-legacy.ts`
- Liest via Railway-CLI oder Export-Endpoint existing JSON/CSV
- `INSERT ... ON CONFLICT (email) DO NOTHING` in Postgres
- Validiert Row-Counts

### Phase 3 — Frontend auf Backend umbiegen

- `fetch('/api/…')` → `fetch(BACKEND_URL + '/…', { credentials: 'include' })`
- Betroffen: Newsletter-Form, Ebook-Waitlist, Quiz, Track-Click (`sendBeacon`), Herzraum-UI
- Astro-Middleware auf `/auth/verify` umstellen
- Astro-API-Routes bleiben **temporär als Proxies** (Safety-Net für 1–2 Tage)

### Phase 4 — Cleanup

- `apps/frontend/src/pages/api/*` komplett löschen (Backend ist die Quelle)
- `src/lib/herzraum-data.ts` + `herzraum-auth.ts` aus Frontend entfernen (Backend hat eigene Kopien)
- JSON-Files in `data/` löschen
- Final-Deploy

### Phase 5 — Sanity-Checks

- Newsletter-Anmeldung aus Footer + /ebook funktioniert
- Quiz-Tracking funktioniert
- Herzraum-Login → Dashboard zeigt Daten
- `scripts/pull-subscribers.sh` läuft über neuen Backend-Admin-Endpoint
- Backend-Deploy-Zeit gemessen < 90 s

### Rollback-Plan

- Backend-Service auf Railway pausieren
- Frontend-Proxy-Routes springen ein (solange Phase 4 noch nicht durchlief)
- Postgres bleibt stehen — kann später wieder angeschlossen werden
- `git revert` der Frontend-Umbiegung bringt alles auf Astro-Stand zurück

---

## Zeit-Abschätzung

| Phase | Aufwand |
|---|---|
| 0: Monorepo-Umbau | 1 Session |
| 1: Backend aufbauen | 2–3 Sessions |
| 2: Daten-Migration | 0.5 Session |
| 3: Frontend umbiegen | 1 Session |
| 4: Cleanup | 0.5 Session |
| 5: Sanity-Checks | 0.5 Session |
| **Gesamt** | **~5–7 Sessions** |

---

## Offene Punkte / Zukunft

- **SendGrid-Integration** — Schema hat `sendgrid_id`-Spalte vorbereitet. Wird eigenes Follow-up (siehe `memory/project_sendgrid_todo.md`).
- **Herzraum als eigener Service** — nur falls Dashboard stark wächst (Option C im Brainstorming).
- **Build-Performance-Optimierung** — Astro-Frontend-Deploy bleibt bei ~7 min wegen 2400+ Pages. Eigenes Thema: Incremental Static Regeneration, Brotli-Cache, etc.
