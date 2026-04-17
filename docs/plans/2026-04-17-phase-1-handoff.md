# Phase 1 Handoff — Backend-Scaffold (Hono + Drizzle + Postgres)

**Status Phase 0:** ✅ Komplett abgeschlossen (17.04.2026)
**Status Phase 1:** ⏳ Noch nicht begonnen
**Arbeitsverzeichnis:** `/tmp/herzblatt-deploy` (fresh clone empfohlen — siehe CLAUDE.md)

---

## Für Claude in der neuen Session

**Paste-Block zum Session-Start (kopiert dich direkt in den Kontext):**

```
Ich möchte Phase 1 des Backend-Splits für herzblatt-journal.com umsetzen.

Kontext:
- Phase 0 (Monorepo-Umbau) ist komplett durch, Commit 4d1ee04 auf main.
- Frontend-Service auf Railway läuft mit rootDirectory=apps/frontend, HOST=0.0.0.0.
- Noch NICHT existiert: Backend-Service, Postgres-DB, der Code in apps/backend/.

Lies ZUERST diese Docs (in dieser Reihenfolge):
1. docs/plans/2026-04-17-backend-split-design.md   — Gesamtdesign, Tech-Stack, Architektur
2. docs/plans/2026-04-17-phase-0-monorepo-umbau.md — Was bereits gelaufen ist (nur Kontext)
3. docs/plans/2026-04-17-phase-1-handoff.md        — Was als nächstes kommt (diese Datei)
4. CLAUDE.md (Root)                                 — Deploy-Workflow (Railway, Fresh-Clone in /tmp)

Dann: Nutze superpowers:writing-plans um einen ausführbaren Phase-1-Plan zu schreiben,
danach superpowers:subagent-driven-development zur Umsetzung.

Ich habe einen Railway-Account-Token, den ich dir geben kann sobald du Backend-Service
und Postgres anlegen willst.
```

---

## Was Phase 1 macht

Das leere `apps/backend/` bekommt echten Code:

1. **Hono-Server** mit allen `/api/*`-Routen (1:1 Port aus `apps/frontend/src/pages/api/`)
2. **Drizzle-ORM + Schema** für 7 Postgres-Tabellen (siehe Design-Doc Abschnitt 3)
3. **Railway-Postgres-Service** anlegen (via GraphQL mit Token oder User-klick)
4. **Zweiter Railway-Service** für Backend (mit `api.herzblatt-journal.com` als Domain)
5. **Import-Script** für Legacy-Daten (data/subscribers.csv + eventuell data/*.json)

Phase 1 ist **additive** — das bestehende Astro-Frontend wird NICHT angefasst. Die Browser-
fetch-Calls werden **erst in Phase 3** auf das Backend umgebogen. Phase 1 bringt nur
das Backend neben dem Frontend zum Laufen.

---

## Was bereits steht (Scaffold aus Phase 0)

```
apps/backend/
├── README.md              # Status-Placeholder
├── package.json           # @herzblatt/backend, nur Placeholder-Scripts
└── src/
    └── .gitkeep           # leer
```

```
packages/shared/
├── package.json           # @herzblatt/shared
├── tsconfig.json
└── src/
    └── index.ts           # PageviewEvent, ClickEvent, RegistrationEvent, SubscriberEntry Types
```

Die Types in `packages/shared/src/index.ts` können vom Backend als Input/Output-Schemas
wiederverwendet werden (nicht zwingend — Drizzle-Schema ist die Quelle der Wahrheit für DB).

---

## Tech-Entscheidungen aus Phase 0 (schon festgelegt)

| Was | Wahl | Begründung im Design-Doc |
|---|---|---|
| HTTP-Framework | Hono (Node) | Abschnitt 2 |
| ORM | Drizzle | Abschnitt 2 |
| DB | Railway Postgres | Abschnitt 2 |
| Auth | Opaque Random Token, Session in DB, Cookie `Domain=.herzblatt-journal.com` | Abschnitt 4 |
| CORS | `https://herzblatt-journal.com` + `localhost:4321` erlaubt | Abschnitt 4 |
| Rate-Limit | In-Memory Map (YAGNI Redis) | Nicht-Ziele |

---

## Railway-Kontext

Gesammelte IDs aus Phase 0 (für GraphQL-API):

```
PROJECT_ID: b6841ed6-199b-4c97-9818-5ff3bb93dbd3
PROJECT_NAME: Herzblatt-Journal.com
ENVIRONMENT_ID: a963e080-5126-44ed-8006-f3660e0d558d  (production)
FRONTEND_SERVICE_ID: 2ba94434-40c7-4d58-b8eb-069952ee9460
FRONTEND_DOMAIN: herzblatt-journal.com
FRONTEND_ROOT_DIR: apps/frontend

BACKEND_SERVICE_ID: (noch nicht angelegt)
BACKEND_DOMAIN: api.herzblatt-journal.com  (muss als custom domain gesetzt werden)
BACKEND_ROOT_DIR: apps/backend

POSTGRES_SERVICE_ID: (noch nicht angelegt)
```

Railway-API-Token bekommt Claude vom User (ist ein Account-scoped Token, wird via
`RAILWAY_API_TOKEN` env var verwendet).

GraphQL-Endpoint: `https://backboard.railway.app/graphql/v2`

---

## ENV-Variables auf Railway (müssen auf Backend-Service gesetzt werden)

Aus bestehenden Frontend-ENV **herüberziehen**:
- `HERZRAUM_PASSWORD`  (aktuell am Frontend, wandert zum Backend)
- `IP_SALT`             (dito)
- `ADMIN_TOKEN`         (für scripts/pull-subscribers.sh, unabhängig)
- `REGISTER_API_URL`    (Proxy zu xLoves)

Neu:
- `DATABASE_URL`        (Auto-Injected via Postgres-Reference)
- `ALLOWED_ORIGINS`     = `https://herzblatt-journal.com`

Optional:
- `PORT`                (Railway injiziert automatisch)
- `NODE_ENV=production` (Railway default)

**Wichtig:** Nach Phase 1 können die Herzraum-Vars (`HERZRAUM_PASSWORD`, `IP_SALT`) vom
Frontend-Service entfernt werden, aber **erst nach Phase 3** (wenn Frontend
die Auth-Verify-Calls an Backend leitet).

---

## API-Routen, die portiert werden müssen

Siehe Design-Doc Abschnitt "API-Migrations-Mapping". Kompakt:

**Public (kein Auth):**
- `POST /pageview`            (aus `apps/frontend/src/pages/api/pageview.ts`)
- `POST /track-click`         (aus `apps/frontend/src/pages/api/track-click.ts`)
- `POST /newsletter`          (aus `apps/frontend/src/pages/api/newsletter.ts`)
- `POST /register`            (aus `apps/frontend/src/pages/api/register.ts`)
- `GET  /readers`             (aus `apps/frontend/src/pages/api/readers.ts`)

**Admin-Session (Cookie `hz_session`):**
- `POST /auth/login`
- `POST /auth/logout`
- `GET  /auth/verify`         (für Astro-Middleware)
- `GET  /herzraum/stats`
- `GET  /herzraum/clicks/sources`
- `GET  /herzraum/newsletter/list`
- `GET  /herzraum/newsletter/export`
- `GET  /herzraum/readers/list`
- `GET  /herzraum/data/export`
- `POST /herzraum/data/clear`
- `POST /herzraum/password/verify`

**Service-Token (Bearer):**
- `GET  /admin/subscribers.csv`  (für `scripts/pull-subscribers.sh`)

Zusätzlich:
- `GET  /health`              (Railway Healthcheck)

---

## Legacy-Daten-Migration

Die aktuelle `data/subscribers.csv` (und evtl. noch vorhandene `data/*.json`) müssen
in die neue DB übertragen werden. Script: `apps/backend/src/scripts/import-legacy.ts`.

Der User kann die CSV-Datei via `scripts/pull-subscribers.sh` aktuell aus dem Frontend-
Container pullen (wenn gerade welche geschrieben sind — sonst leer nach Deploy, da
ephemeral filesystem).

---

## Subdomains-Setup

`api.herzblatt-journal.com` muss nach dem Backend-Service-Anlegen:
1. Als Custom Domain am Backend-Service in Railway hinzugefügt werden
2. DNS-CNAME auf den Railway-provided Hostname zeigen lassen

Railway-CNAME-Pattern: `<random>.up.railway.app` (wird im Dashboard angezeigt
oder via GraphQL `service { domains { customDomains { domain targetUrl } } }` auslesbar).

---

## Migrations-Phasen-Reminder aus Design-Doc

- **Phase 1:** (diese) Backend aufbauen, Postgres, Service anlegen
- **Phase 2:** Daten-Migration (Legacy-CSV/JSON → DB)
- **Phase 3:** Frontend-fetch-Calls auf Backend umbiegen
- **Phase 4:** Astro-API-Routen löschen (kein Proxy mehr)
- **Phase 5:** Sanity-Checks + Metrik: Backend-Deploy < 90 s

---

## Was NICHT in Phase 1 gemacht wird

- Frontend-Code berühren
- API-Routen im Astro löschen (erst Phase 4)
- CORS-Fetch-Umstellung (erst Phase 3)
- SendGrid-Integration (eigenes Thema — siehe `~/.claude/projects/.../memory/project_sendgrid_todo.md`)
- Herzraum als dritter Service (YAGNI, Design-Doc Option C)

---

## Pragmatische Tipps

- Die Session, die Phase 1 umsetzt, wird umfangreich. **Plan in Sub-Phasen aufteilen**:
  1. Drizzle-Schema + Migration-Files
  2. DB-Service in Railway anlegen + Schema pushen
  3. Hono-Scaffold + Public-Routes (pageview, track-click, newsletter, register)
  4. Auth-System (login, logout, verify, Session-DB)
  5. Admin-Routes (stats, lists, exports)
  6. Backend-Service in Railway + Custom Domain
  7. Health-Check + Deploy-Validation

  Je nach Complexity können das 2–3 Sessions sein. Schreibe Phase-1-Plan entsprechend
  in mehreren Dateien falls nötig.

- Der lokale `pnpm install` auf dem fresh clone braucht ~7 s (348 Packages bereits
  gecacht).

- Lokal testen: `pnpm --filter @herzblatt/backend dev` startet Hono auf localhost.
  Frontend muss dann `BACKEND_URL=http://localhost:3001` kennen (aber das ist erst
  Phase 3).

- **Vermeide Over-Engineering.** Hono+Drizzle reichen. Kein tRPC, kein Prisma,
  kein NestJS. Design-Doc ist explizit YAGNI-orientiert.

---

## Abschluss Phase 0 — Commit-History (Referenz)

```
4d1ee04 chore(monorepo): Shim aus root-package.json + nixpacks.toml entfernt
712487e fix(frontend): HOST=0.0.0.0 im start-command
cb36aad fix(dating-typ-test): globales * reset + html/body Overrides entfernt
9660547 build(railway): nixpacks.toml für pnpm-Workspace-Monorepo  (obsolete nach 4d1ee04)
e496a2d Merge: Phase 0 — Monorepo-Umbau
8f65132 refactor(monorepo): Phase 0 — Astro zu apps/frontend, Scaffolds
5e6e42a docs(plans): Phase 0 Implementation Plan — Monorepo-Umbau
e8654d9 docs(plans): Backend-Split-Design (approved 2026-04-17)
```

Live-Verifikation Phase 0 am Abschluss:
- HTTP 200 auf `/`, `/ebook`, `/herzraum/login`, `/blog/*`
- Last-Modified: `12:44:36 UTC` (commit 8cb9d30b, rootDirectory-Switch-Deploy)
- Navigation auf allen Seiten zurück
- Build-Zeit: ~20 Min (langsamer als Mac-lokal wegen Railway-Builder-Container-Resources)

**Bereit für Phase 1.**
