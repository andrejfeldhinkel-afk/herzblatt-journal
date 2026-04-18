# ADMIN_AUDIT — Phase 1 Discovery (Stand 2026-04-18)

## ⚠️ Prompt-Korrektur

Der Auftrag beschreibt eine alte Architektur die nicht mehr existiert:

| Annahme im Prompt | Realität |
|---|---|
| Pfad `/home/xy/Andrej/blog/` | Railway-Monorepo `apps/frontend` + `apps/backend` |
| Server: `server.mjs` auf Port 9991 | Railway: Frontend :4321 + Backend :3001, Dockerfiles, Hono + Astro-Node-Adapter |
| Daten in JSON / SQLite / In-Memory | **Postgres** mit 8 Tabellen (pageviews, clicks, subscribers, registrations, sessions, login_attempts, readers_counter, purchases) |
| 1.236 Artikel, 303 Bilder, 82 Redirects, 5 Autoren | **1.839 Artikel, 1.784 Bilder, 185 Redirects, 4 aktive Autoren + "redaktion"-Fallback** |
| Kein Admin vorhanden | **`/herzraum` Admin-Bereich existiert** mit Login + 8 Sub-Pages |
| Kein Auth | **Cookie-Session-Auth** (hz_session), backend-verified, Rate-Limiting, Domain-scoped |
| `/admin/*` als Pfad | **`/herzraum/*`** (deutschsprachig, User-Wunsch) |

Viel vom Prompt-Scope existiert schon. Dieser Audit zeigt **was da ist vs. was fehlt**, und schlägt einen angepassten Plan vor.

---

## ✅ WAS EXISTIERT

### Admin-Pages (`apps/frontend/src/pages/herzraum/`)
| Route | Funktion |
|---|---|
| `/herzraum/login` | Login-Form (Passwort → Backend `/auth/login` → Cookie) |
| `/herzraum` (index) | Overview-Dashboard mit 6 KPI-Tiles + Charts (pageviews 30d, top articles) |
| `/herzraum/artikel` | Artikel-Liste mit Filter, Stats (total, ohne Bild, ohne Tags, thin content) |
| `/herzraum/traffic` | Pageviews-Analytics (path, referrer, charts) |
| `/herzraum/klicks` | Affiliate-Click-Stats mit Top-Source-Artikeln |
| `/herzraum/newsletter` | Abonnenten-Liste + Wachstumskurve + CSV-Export |
| `/herzraum/verkaeufe` | E-Book-Verkäufe (Digistore-IPN-gebacked) |
| `/herzraum/leser` | Registrierungen (xLoves-Signups) + NL-Overlap |
| `/herzraum/einstellungen` | Passwort ändern, Daten-Export, Daten löschen |

### Backend-Routes (Hono, `apps/backend/src/routes/`)

**Public Data-Ingest** (alle insertieren in Postgres):
- `POST /pageview` — tracked jeden Seitenaufruf
- `POST /track-click` — Affiliate-Link-Clicks (Whitelist: 32 Targets + `ebook-buy`, `ebook-waitlist`)
- `POST /newsletter` — NL-Anmeldung + fire-and-forget SendGrid
- `POST /register` — xLoves-Registrierung-Proxy
- `POST /digistore-ipn` — E-Book-Kauf-Webhook mit SHA-512-Signature-Verify
- `GET /readers` — Fake-Counter für Homepage
- `GET /unsubscribe` — HMAC-Token-basiert
- `GET /health`

**Herzraum (Session-Cookie-Auth)**:
- `/herzraum/stats?range=today|7d|30d|90d`
- `/herzraum/clicks/sources?days=N`
- `/herzraum/newsletter/list`, `/herzraum/newsletter/export`
- `/herzraum/readers/list`
- `/herzraum/data/export`, `/herzraum/data/clear`
- `/herzraum/password/verify`
- `/herzraum/purchases?limit=N`

**Admin (Bearer-ADMIN_TOKEN)**:
- `/admin/subscribers.csv` — NL-Export
- `/admin/purchases.csv` — Käufe-Export (HGB §257-konform)
- `/admin/metrics` — Observability-JSON (uptime, DB-counts, env-keys)
- `/admin/backup.json` — vollständiger DB-Snapshot
- `/admin/cron/cleanup` — expired sessions, alte login-attempts
- `/admin/sendgrid/{status,sync,test}` — SG-Admin-Ops
- `/admin/gdpr/{delete,export}` — DSGVO Art. 15/17

### Auth-System (komplett da, bcrypt nicht nötig)
- Login: `POST /auth/login` mit `HERZRAUM_PASSWORD` env
- Token: SHA-256-hashed in `sessions`-Tabelle, 24h TTL
- Cookie: `hz_session`, Domain=.herzblatt-journal.com, HttpOnly, Secure, SameSite=Lax
- Middleware `apps/frontend/src/middleware.ts`: schützt `/herzraum/*` + `/api/herzraum/*`
- Rate-Limit: Login 5/15min, Public-API 60/min shared, Newsletter 10/h per IP
- Logout: `POST /auth/logout` clear cookie

### Content-System
- Astro-Content-Collection: `apps/frontend/src/content.config.ts`
- Schema: `title, description, date, updated?, tags[], image?, imageAlt?, keywords[], draft, featured, author, faq[]`
- Alle 1.839 Artikel haben image ✓ (0 ohne Bild)
- Autoren-Verteilung:
  - sarah-kellner: 810
  - markus-hoffmann: 290
  - thomas-peters: 154
  - laura-weber: 128
  - redaktion: 8

### Observability-Stack (heute live gegangen)
- **Sentry** (`l-p-gmbh-kf`-Org, Projekt `herzblatt`, DSN set, Test-Events angekommen)
- **SendGrid** (Main-Account, Sender `support@herzblatt-journal.de` verified, DKIM valid, Contact-Liste `66b5b5b3...` mit 8 synced Subscribers)
- **Digistore24-Webhook ready** (wartet auf Produkt-Config + IPN-Passphrase)
- **GitHub-Actions** (Workflows als Copy-Paste-Blöcke im Status-Doc — Token hat workflow-scope nicht)

---

## ❌ WAS FEHLT (realistische Gaps — Value des Prompts)

### Content-Erstellung (Prompt-Phase 2)
- **Artikel-Templates** (ratgeber, test-bericht, listicle, interview, local-dating) — existieren nicht
- **Artikel-Generator-UI** unter `/herzraum/artikel/neu` — Template wählen, Felder ausfüllen, Markdown schreiben
- **Slug-Validierung** gegen bestehende 1.839 + 185 Redirects
- **Bild-Picker** mit den 1.784 vorhandenen Bildern (inkl. Orphan-Detection)

### Content-Management (Prompt-Phase 4)
- `/herzraum/artikel` ist aktuell **read-only Stats-Liste**. Es fehlt:
  - Inline-Edit (Title, Description, Author, Tags, Image)
  - Bulk-Aktionen (Author umsetzen, Tag add/remove, CSV-export)
  - Volltext-Suche (aktuell nur Client-side Filter)
  - Vorschau-Link
- `/herzraum/bilder` existiert nicht — Grid-View + Orphan-Detection
- `/herzraum/redirects` existiert nicht — 185 Redirects liegen in `astro.config.mjs` als Code, kein UI
- `/herzraum/autoren` existiert nicht — Autoren sind hardcoded in Astro-Components, keine Bio/Expertise-Felder

### Stats & Health (Prompt-Phase 3)
- **Wortanzahl-Verteilung** (Histogramm): nicht visualisiert
- **Top-Artikel nach Pageviews**: `/herzraum/traffic` zeigt's schon ✓
- **Tag-Pages mit <3 Artikeln** (Thin-Content-SEO-Risiko): fehlt
- **Duplicate-Titles-Detection**: fehlt
- **Broken-Internal-Links-Crawler**: fehlt
- **Artikel ohne Meta-Description**: fehlt (alle haben Desc via Schema-Required aber Länge unchecked)
- **Build-Health** (Datum, Dauer, Erfolg/Fehler): fehlt — wäre via Sentry/Railway-API möglich
- **404-Log**: existiert nicht in DB

### Audit & Sicherheit (Prompt-Phase 5)
- **Audit-Log** (wer hat wann was geändert) — aktuell nur Login-Attempts in DB
- **CSRF-Tokens** — aktuell nicht implementiert (POST/PATCH/DELETE auf Same-Origin via Cookie)
- **Input-Sanitization** gegen XSS in Frontmatter — fehlt

---

## 📊 Daten verfügbar aber nicht visualisiert

- `clicks.type` (affiliate/ebook-buy/...) — kein Filter im Dashboard
- `subscribers.source` — Verteilung wird in `/herzraum/newsletter` geplottet, aber nicht tief
- `purchases.raw_payload` — JSON-Debug-Info, nicht exposed in UI
- `login_attempts` — wird für Rate-Limit gelesen, aber kein UI für "letzte 20 versuche"
- `sessions` — niemand sieht aktive Sessions mit Create-Time, IP-Hash

---

## 🗺 VORGESCHLAGENE ANGEPASSTE ROADMAP

Skip was bereits existiert, fokus auf **neue Value**. Vorschlag:

### ✂ Phase 2 (angepasst): Content-Tools
- **2a** — Templates-System (5 Templates in `apps/frontend/src/data/article-templates.ts`)
- **2b** — Artikel-Generator unter `/herzraum/artikel/neu` mit Preview
- **2c** — Slug-Kollisionsprüfung gegen 1.839 Artikel + 185 Redirects
- **2d** — API: `POST /api/herzraum/article` (Session-Auth, writes Markdown-File)

### ✂ Phase 3 (angepasst): Stats-Erweiterung
Skip was `/herzraum` + `/herzraum/artikel` + `/herzraum/traffic` schon machen. Neu:
- **3a** — Wortanzahl-Histogram + Thin-Content-Liste (nicht nur Count)
- **3b** — Tag-Pages-Health (Tags mit <3 Artikeln)
- **3c** — Duplicate-Titles + SEO-Quick-Check
- **3d** — Build-Health via Railway-API im Dashboard

### ✂ Phase 4 (angepasst): Management
- **4a** — Artikel-Inline-Edit (PATCH auf Markdown-File via `POST /api/herzraum/article/{slug}`)
- **4b** — `/herzraum/bilder` Grid + Orphan-Detection
- **4c** — `/herzraum/redirects` Tabelle + CRUD (updated astro.config.mjs via API)
- **4d** — `/herzraum/autoren` CRUD mit neuer `authors`-Content-Collection

### ✂ Phase 5 (angepasst): Hardening
Auth existiert — Erweiterungen:
- **5a** — CSRF-Tokens für alle POST/PATCH/DELETE
- **5b** — Input-Sanitization für Frontmatter (HTML-escape, length-caps)
- **5c** — Audit-Log-Tabelle + UI

### ✂ Phase 6: QA
Gegen die neuen Pages. Smoke-Test-Script existiert (`scripts/smoke-test.sh`) — nur erweitern.

### ✂ Phase 7: Deploy & Docs
Bereits Workflow etabliert. Nur noch: User-Doku unter `docs/ADMIN.md` + `/herzraum/einstellungen` erklärt-Section.

---

## ❓ Entscheidungen die ich brauch vom User

1. **Scope**: Welche der obigen 2a-5c machen? Alles, Auswahl, oder nur das was dir am meisten fehlt?
2. **Prio**: Was soll als erstes kommen? Vermutung: **2 (Templates+Generator)** — damit kannst du sofort schneller Artikel schreiben.
3. **Autoren-Management**: Sollen Autoren in eine neue Astro-Content-Collection (`apps/frontend/src/content/authors/`) oder in Postgres?
4. **Redirects-Management**: `astro.config.mjs` per API modifizieren + Redeploy (säuberlich aber komplex) oder in Postgres ziehen und via Middleware serven (schneller aber Architektur-Change)?
5. **Bilder-Verwaltung**: Upload-Funktion gewünscht oder nur Orphan-Detection auf vorhandenen 1.784?

**STOP — sag mir welche Phasen du willst und ich fang mit der ersten an.**
