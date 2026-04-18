# Herzraum — Admin-Bereich Dokumentation

Der Admin-Bereich lebt unter **`/herzraum`** und ist Cookie-Session-auth-geschützt.
Login: **https://herzblatt-journal.com/herzraum/login** — Passwort aus Railway-ENV `HERZRAUM_PASSWORD`.

---

## Nav-Struktur

| Route | Funktion |
|---|---|
| `/herzraum` | Overview-Dashboard (KPIs + Charts: Pageviews, Top Articles) |
| `/herzraum/artikel` | Liste aller 1.839 Artikel mit Filter, Such, Edit-Links |
| `/herzraum/artikel/neu` | **Artikel-Generator** (5 Templates + Live-Preview + GitHub-Commit) |
| `/herzraum/artikel/edit/[slug]` | **Inline-Edit** eines bestehenden Artikels (Frontmatter + Body) |
| `/herzraum/bilder` | Bilder-Grid (1.784) + Orphan-Detection |
| `/herzraum/autoren` | Autoren-CRUD (Bio, Expertise, Credentials) |
| `/herzraum/redirects` | Alle Redirects (astro.config.mjs + middleware.ts) — read-only |
| `/herzraum/health` | **Content-Health & SEO**: Thin-Content, Duplicate-Titles, Thin-Tags, Meta-Length |
| `/herzraum/traffic` | Pageviews-Analytics |
| `/herzraum/klicks` | Affiliate-Click-Stats + Top-Source-Articles |
| `/herzraum/newsletter` | Newsletter-Abonnenten + Wachstum + CSV-Export |
| `/herzraum/verkaeufe` | E-Book-Verkäufe (via Digistore-IPN) |
| `/herzraum/leser` | Registrierungen (xLoves-Signups) |
| `/herzraum/audit` | **Audit-Log** aller schreibenden Admin-Actions |
| `/herzraum/einstellungen` | Passwort ändern, Daten-Export, Daten-Clear |

---

## API-Endpoints (Backend, Session-Auth)

### Artikel

- `GET /api/herzraum/articles/check-slug?slug=xxx` → `{ available, reason?, conflict? }` — 3-Weg-Check (Format + GitHub-File + Redirects)
- `POST /api/herzraum/articles` — Body `{ slug, frontmatter, body }` → erstellt `apps/frontend/src/content/blog/{slug}.md` via GitHub-API-Commit
- `GET /api/herzraum/articles/[slug]` → `{ sha, frontmatterRaw, body }` für Edit-Form
- `PATCH /api/herzraum/articles/[slug]` — Body `{ frontmatter, body, sha }` → updatet File (sha verhindert Race-Conditions)

### Autoren

- `GET /api/herzraum/authors` → `{ authors: Record<slug, Author>, sha }`
- `GET /api/herzraum/authors/[slug]` → `{ author, sha }`
- `POST /api/herzraum/authors` → anlegen
- `PUT /api/herzraum/authors/[slug]` → updaten

Datenquelle: `apps/frontend/src/data/authors.ts` (TypeScript-File, live geparst + rewritten).

### Redirects

- `GET /api/herzraum/redirects` → alle 185+ Redirects aus `astro.config.mjs` + `src/middleware.ts` (read-only)

### Audit-Log

- `GET /api/herzraum/audit-log?limit=500` → letzte Admin-Actions

---

## Architektur: GitHub-API-Commits statt FS-Writes

Railway-Container haben **ephemerer FS**. Artikel/Autoren würden beim nächsten Deploy verloren gehen.

**Lösung**: Alle Writes gehen via **GitHub-Contents-API** direkt in den `main`-Branch.
Railway's GitHub-Webhook triggert dann einen **automatischen Redeploy** (~5-7 Min).

Flow:
1. Admin klickt "Speichern" im Herzraum-UI
2. Backend POST/PATCH → GitHub-API erstellt/updatet File
3. Commit landet auf `main`
4. Railway-Webhook triggert Frontend-Build
5. Nach ~7 Min ist Änderung live

---

## ENV-Vars (Railway Backend-Service)

### Pflicht
```
DATABASE_URL          = {{Postgres.DATABASE_URL}}
HERZRAUM_PASSWORD     = <admin password>
IP_SALT               = <random hex>
ADMIN_TOKEN           = <random hex 64-char>
COOKIE_DOMAIN         = .herzblatt-journal.com
ALLOWED_ORIGINS       = https://herzblatt-journal.com
```

### Für Artikel/Autoren-Writes
```
GITHUB_TOKEN          = <PAT mit contents:write auf herzblatt-journal-Repo>
GITHUB_OWNER          = andrejfeldhinkel-afk  (default)
GITHUB_REPO           = herzblatt-journal     (default)
GITHUB_BRANCH         = main                  (default)
```

### Optional (aktiviert Features wenn gesetzt)
```
SENTRY_DSN                   — Error-Tracking
SENDGRID_API_KEY             — Newsletter-Auto-Welcome
SENDGRID_LIST_ID             — Contact-Liste für Bulk-Sync
SENDGRID_FROM_EMAIL          — verifizierter Sender
SENDGRID_FROM_NAME           — Absender-Name
DIGISTORE_IPN_PASSPHRASE     — E-Book-Webhook-Signature
UNSUBSCRIBE_SECRET           — HMAC-Key für Unsub-Tokens
PUBLIC_BASE_URL              — für Unsub-Link-Builder (default: herzblatt-journal.com)
```

### Frontend-Service
```
BACKEND_URL                  = https://backend-production-c327.up.railway.app
DIGISTORE_BUY_URL            = optional — aktiviert Live-Kauf-Button auf /ebook
SENTRY_DSN_FRONTEND          = optional
```

---

## Audit-Log: welche Actions werden geloggt

| Action | Wann | Target | Meta |
|---|---|---|---|
| `article.create` | Neuer Artikel | slug | commitUrl, title |
| `article.update` | Artikel-Edit | slug | commitUrl, title |
| `author.create` | Neuer Autor | slug | commitUrl |
| `author.update` | Autor-Edit | slug | commitUrl |

Schreibt in Postgres `audit_log`-Tabelle. Lesbar via Audit-Log-UI oder
`GET /api/herzraum/audit-log`.

---

## Artikel-Templates

Gespeichert in `apps/frontend/src/data/article-templates.ts`. 5 Templates:

| Template | Zweck | Min-Wörter |
|---|---|---|
| `ratgeber` | Problem → Lösung → FAQ | 1.200 |
| `test-bericht` | Pro/Contra → Bewertung → Fazit | 1.500 |
| `listicle` | Intro → 7-10 Punkte → Outro | 1.000 |
| `interview` | Vorstellung → Q&A → Take-aways | 1.400 |
| `local-dating` | Stadt → Locations → Tipps | 1.300 |

Jedes Template definiert `placeholders: TemplatePlaceholder[]` die als Form-Felder
im Generator-UI gerendert werden.

---

## Content-Health-Checks

`/herzraum/health` berechnet über alle Artikel:

- **Thin Content**: < 800 Wörter (sollte 0 sein)
- **Duplicate Titles**: exakt gleicher Titel bei verschiedenen Slugs
- **Thin Tag-Pages**: Tags mit < 3 Artikeln (SEO-Risiko)
- **Meta-Description zu kurz**: < 80 Zeichen
- **Meta-Description zu lang**: > 180 Zeichen
- **Ohne Bild**: aktuell 0
- **Wortanzahl-Histogramm**: Buckets 500 / 800 / 1.200 / 1.800 / 2.500 / 4.000+

---

## Development

### Lokal bauen
```bash
cd /tmp/herzblatt-deploy
pnpm install
pnpm --filter @herzblatt/backend build
pnpm --filter @herzblatt/frontend build  # ~7 min — 1839 pages
```

### Smoke-Test gegen Production
```bash
ADMIN_TOKEN=<token> ./scripts/smoke-test.sh
```

### Unit-Tests (Backend)
```bash
pnpm --filter @herzblatt/backend test  # 22 Tests
```

---

## Deploy-Flow

1. Git-Commit auf `main` → Railway-Webhook-Trigger
2. Backend-Service baut (~2 min via Dockerfile)
3. Frontend-Service baut (~7-20 min wegen 1.839 SSG-Pages)
4. Bei Änderungen unter `apps/frontend/**` baut nur Frontend
5. Bei Änderungen unter `apps/backend/**` baut nur Backend

Railway-GraphQL-API kann Deploys auch manuell triggern — siehe
`docs/plans/2026-04-18-PHASE-2-STATUS.md` für Commands.

---

## Notfall-Reset

Wenn der Admin-Bereich nicht zugänglich ist:
1. Railway-Dashboard → Backend → Variables → `HERZRAUM_PASSWORD` neu setzen
2. Backend Redeploy
3. Sessions werden nicht automatisch invalidiert — ggf. `DELETE FROM sessions` auf Postgres

Sessions laufen nach 24h automatisch ab. Cron-Cleanup (`/admin/cron/cleanup`)
löscht abgelaufene Sessions stündlich (wenn Cron konfiguriert).
