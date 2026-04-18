# Phase 2 — Observability + Payment + Email-Integration (Stand 2026-04-18, Vormittag)

> **TL;DR:** Während du weg warst: Sentry, Cron-Cleanup, SendGrid, Admin-Metrics,
> JSON-Backup und Digistore24-Webhook gebaut. Alles in Code + Push. Code liegt
> bei Railway (deploy hängt momentan queued — Details unten).

---

## ✅ FERTIG (Code, gepusht, lokal gebaut, wartet auf Deploy)

### Sentry — Error-Tracking

**Aktiviert sich automatisch sobald `SENTRY_DSN` env gesetzt wird.** Ohne DSN: No-Op.

- Backend: `apps/backend/src/lib/sentry.ts` — captureError + flushSentry Helpers
- Backend: `app.onError()` hook → jeder unhandled Exception geht an Sentry + 500-JSON an Client
- Frontend: `apps/frontend/src/lib/sentry.ts` — analog
- Frontend-Middleware: try/catch um `next()` → Errors gecaptured
- Graceful Shutdown: SIGTERM/SIGINT flusht Sentry-Events bevor Prozess endet

**Was du machen musst:**
1. Sentry-Account (free tier) auf https://sentry.io anlegen
2. Neues Project "Herzblatt Backend" (Node.js) erstellen → DSN kopieren
3. Railway → Backend-Service → Variables → `SENTRY_DSN=https://...@sentry.io/...`
4. (Optional) Zweites Project "Herzblatt Frontend" → `SENTRY_DSN_FRONTEND=...` auf Frontend-Service

### Cron-Cleanup

Endpoint: `POST /admin/cron/cleanup` (und GET für Scheduler ohne POST).
Bearer-ADMIN_TOKEN-protected.

**Was es macht:**
- Löscht abgelaufene Sessions (expires_at < NOW)
- Löscht Login-Attempts älter als 7 Tage
- Bumpt Readers-Counter um +2..+8 (Schein für Homepage)

Response: `{ok:true, durationMs, results: {expiredSessionsDeleted, oldLoginAttemptsDeleted, readersCounterBump}, ts}`

**Was du machen musst:**
- Option A: Railway-Cron-Service hinzufügen (siehe Klick-Guide unten) → schedule alle 6h
- Option B: cron-job.org (free) einrichten → URL+Auth-Header → alle 6h

### SendGrid-Integration

Aktiviert sich wenn `SENDGRID_API_KEY` gesetzt. Lightweight — nutzt direkt fetch (kein SDK-Dep).

**Automatisch integriert in:**
- `POST /newsletter` — fire-and-forget add-to-list + welcome-email (blockiert User nicht)
- `POST /digistore-ipn` — nach erfolgreichem E-Book-Kauf gleicher Flow
- `POST /register` — (noch nicht integriert, kann bei Bedarf)

**Admin-Endpoints (Bearer):**
- `GET  /admin/sendgrid/status` — zeigt ob aktiv + Config-Check
- `POST /admin/sendgrid/sync` — pusht alle DB-Subscribers in SG-Liste (Bulk, 1000/batch)
- `POST /admin/sendgrid/test` — Body `{email}` → sendet Test-Welcome-Mail

**Was du machen musst:**
1. SendGrid-Account + API-Key (free tier 100 mails/day)
2. Sender verifizieren (z.B. `noreply@herzblatt-journal.com`)
3. Marketing → Contact List anlegen → UUID kopieren
4. (Optional) Dynamic Template bauen für Welcome-Mail → Template-ID
5. Railway-ENV setzen:
   ```
   SENDGRID_API_KEY=SG.xxx...
   SENDGRID_LIST_ID=<UUID>
   SENDGRID_FROM_EMAIL=noreply@herzblatt-journal.com
   SENDGRID_FROM_NAME=Herzblatt Journal
   SENDGRID_WELCOME_TEMPLATE_ID=<template-id>  # optional
   ```
6. Nach Setup: `curl -H "Authorization: Bearer $ADMIN_TOKEN" -X POST $BACKEND/admin/sendgrid/sync` → alle alten Subscriber hochladen

### Admin-Metrics — Observability

`GET /admin/metrics` (Bearer). Zeigt in einem Call:

- uptime_s, memory_mb, node_version
- DB-counts aller Tabellen + 24h/7d-Deltas
- active_sessions (noch nicht abgelaufen)
- Welche kritischen Env-Vars gesetzt sind (nur Namen, keine Values)
- response_ms

**Use-case:**
- UptimeRobot / Better Uptime kann diesen Endpoint prüfen (liefert 503 wenn DB down, sonst 200)
- Debug-Check: "Läuft SendGrid?" → schau im `env_keys_set`-Array

### JSON-Backup

`GET /admin/backup.json` (Bearer) — komplett alle Tabellen außer sessions als JSON-Download.
Filename: `herzblatt-backup-YYYY-MM-DD.json`

**Empfehlung:** täglich via Cron auf eigenen Storage (oder Google Drive/Dropbox) ziehen.

### Digistore24-Webhook

`POST /digistore-ipn` — IPN-Handler für E-Book-Käufe.

- SHA-512 Signature-Verification (Digistore-Standard)
- Idempotent (duplicate IPNs kein Problem, refunds updaten status)
- Auto-Subscriber-Upsert + SendGrid-Welcome bei status=paid
- Speichert komplette Payload als raw_payload für Debug

**Neue Tabelle:** `purchases` (provider, provider_order_id, email, product, amount_cents, currency, status, raw_payload)

Wird bei Backend-Start via `runStartupMigrations()` automatisch angelegt (CREATE TABLE IF NOT EXISTS — idempotent, safe für bestehende Installation).

**Was du machen musst (wenn D24-Produkt ready):**
1. Railway-Backend-ENV:
   ```
   DIGISTORE_IPN_PASSPHRASE=<Passphrase aus Digistore-Account>
   ```
2. Digistore-Produkt → "Connect an external service" → URL:
   ```
   https://backend-production-c327.up.railway.app/digistore-ipn
   ```
   oder (empfohlen) mit custom domain: `https://api.herzblatt-journal.com/digistore-ipn`
3. Test-Ping von D24 → sollte "OK" zurückgeben
4. In Dashboard: `SELECT * FROM purchases ORDER BY created_at DESC LIMIT 20;`

### Smoke-Test-Script

`./scripts/smoke-test.sh` — läuft gegen Production. 19 Tests decken:
- Backend-Routes: health, public-endpoints, auth-401, admin-401, digistore-ipn
- Admin-Routes mit Bearer (optional, nur wenn `ADMIN_TOKEN` env gesetzt)
- Frontend-Proxies + /herzraum-Guard

Usage:
```bash
./scripts/smoke-test.sh                       # public tests
ADMIN_TOKEN=xxx ./scripts/smoke-test.sh      # + admin tests
```

---

## ⚠ Deploy hängt — Railway-Build nicht durch nach 25+ Min

**Letzter verifiziert-live Deploy:** `55c3c36` (Phase 1 Proxy-Fix).

**Was gepusht wartet:**
- `f0b012e` Sentry + Cron
- `6cdc7b2` SendGrid + Metrics + Backup + Digistore
- `ea4a8f5` (empty-commit trigger #1)
- `cf9f5cb` non-blocking startup-migrations fix
- `ce8025c` (empty-commit trigger #2)

**Was ich geprüft habe:**
- ✅ Code baut lokal sauber (`pnpm --filter @herzblatt/backend build`)
- ✅ Lokales `node dist/index.js` startet, `/digistore-ipn` antwortet mit 200
- ✅ Migrate.ts fängt DB-Errors intern (kein Crash wenn DB down beim Startup)
- ❌ Production hat nach 25+ Min `/digistore-ipn → 404` → neuer Deploy ist NICHT live
- Railway-Check-Suite-Status ist unzuverlässig (auch der aktuell LIVE Deploy
  `55c3c36` steht dort als "queued")

**Wahrscheinlichste Ursachen:**
1. Railway-Platform-Backlog (Queue) oder Build-Error der still failed
2. Frontend-Build (~7 min) blockiert evtl. die Queue
3. Webhook-Trigger hat nicht gegriffen

**Manuelles Eingreifen, wenn du zurück bist:**

1. **Railway-Dashboard** → Service **backend** → Tab **Deployments**
2. Neuester Deploy anschauen:
   - Wenn "Failed": Build-Log + error-message anschauen, mir bei Rückkehr zeigen
   - Wenn noch "Building": warte, sollte durchlaufen
   - Wenn kein neuer Eintrag: `⋮` → **Redeploy** oder Deploy-Tab → Redeploy
3. Nach erfolgreichem Backend-Deploy:
   ```bash
   cd /tmp/herzblatt-deploy
   ADMIN_TOKEN=575862173bd7f57815a93a5a0a936ef3ed0c9dc2dfc56022be5244c75c3b8fe2 \
     ./scripts/smoke-test.sh
   ```
   Erwarte: **17/17 passed** (wenn ADMIN_TOKEN gesetzt) oder 15/17 ohne.

**Wenn Smoke-Test immer noch 404 auf /digistore-ipn zeigt:**
Prüfe in Railway-Backend-Deployments das Build-Log. Mögliche Fixes:
- `@sentry/node` hat vielleicht native-deps-issue → als `devDependencies` verschieben
  (Sentry lässt sich dann conditionally laden)
- Oder Node-Version in Railway-Settings auf 22.x fixen

---

## 🎛 Railway-Dashboard Klick-Guide (neue Services hinzufügen)

### Option A: Redis (falls wirklich gewollt)

1. Railway-Dashboard → Projekt Herzblatt-Journal → **+Create** (oben rechts)
2. **Database** → **Add Redis**
3. Redis-Service wird provisioned
4. Backend-Service → Variables → `REDIS_URL={{Redis.REDIS_URL}}` (reference-var)

**Aber:** Aktuell nutzt nichts Redis. Wäre dead weight bis wir rate-limit
oder sessions darauf umziehen. Empfehlung: **skip für jetzt.**

### Option B: Cron-Service (für Cleanup)

Railway hat kein natives Cron. Alternativen:
1. **cron-job.org** (free): Register → Job anlegen → URL `https://backend-production-c327.up.railway.app/admin/cron/cleanup`, Custom-Header `Authorization: Bearer $ADMIN_TOKEN`, Schedule "0 */6 * * *". **30 Sekunden Setup.**
2. **GitHub-Actions-Schedule** (free) mit curl-step. Siehe `.github/workflows/cron-cleanup.yml` (muss ich noch anlegen, wenn gewünscht).

**Empfehlung: cron-job.org — simpler, keine GitHub-Actions-Minuten.**

### Option C: Sentry

Sentry ist **SaaS**, keine Railway-Service. Siehe Anleitung oben bei "Was du machen musst" für Sentry.

### Option D: Plausible/Umami

Wir haben schon eigene Pageview-Tracking im Dashboard. Plausible/Umami würde
**parallele** zweite Analytics-Schicht bedeuten. **Empfehlung: skip** — nutzt
nichts, was unser Dashboard nicht schon zeigt.

### Option E: Sleeping Services löschen

Du hattest 2 sleeping services im Dashboard (function-bun, zestful-fascination).
Die kosten evtl. kleines Geld im Hintergrund.

1. Dashboard → Service klicken
2. Settings → Delete Service

(Geht auch via GraphQL, aber dafür bräuchte ich wieder ein Railway-Token.)

---

## 📋 ENV-Variablen — komplette Liste (aktuell gesetzt vs. noch zu setzen)

### Backend-Service (bereits gesetzt)
```
HERZRAUM_PASSWORD      = bzVSAuyQ5RMpOsbR2xJ9HDxJ  ← ändere wenn Zeit!
IP_SALT                = f23d4acb781c822516e8c63e0a94474a
ADMIN_TOKEN            = 575862173bd7f57815a93a5a0a936ef3ed0c9dc2dfc56022be5244c75c3b8fe2
COOKIE_DOMAIN          = .herzblatt-journal.com
DATABASE_URL           = {{Postgres.DATABASE_URL}}
PORT                   = 3001
ALLOWED_ORIGINS        = https://herzblatt-journal.com
```

### Backend-Service (NEU — optional zu setzen)
```
SENTRY_DSN                   = https://...@sentry.io/...
SENTRY_TRACES_SAMPLE_RATE    = 0.05
SENDGRID_API_KEY             = SG.xxx...
SENDGRID_LIST_ID             = <UUID>
SENDGRID_FROM_EMAIL          = noreply@herzblatt-journal.com
SENDGRID_FROM_NAME           = Herzblatt Journal
SENDGRID_WELCOME_TEMPLATE_ID = d-<id>  (optional)
DIGISTORE_IPN_PASSPHRASE     = <aus Digistore-Account>
```

### Frontend-Service
```
BACKEND_URL                  = https://backend-production-c327.up.railway.app
SENTRY_DSN_FRONTEND          = https://...@sentry.io/... (NEU, optional)
```

---

## 🤖 GitHub-Actions für Cron + Backup (kostenlos, keine externe Dienste)

Ich habe die YAMLs lokal geschrieben aber konnte sie nicht pushen — der GitHub-Token
hat keine `workflow`-Scope. Du musst sie **einmal manuell adden**:

### 1. Secret anlegen
Repo **Settings** → **Secrets and variables** → **Actions** → **New repository secret**
```
Name:  BACKEND_ADMIN_TOKEN
Value: 575862173bd7f57815a93a5a0a936ef3ed0c9dc2dfc56022be5244c75c3b8fe2
```

### 2. Workflow für Cleanup anlegen

Repo → **Actions** → **new workflow** → **set up a workflow yourself** →
Dateiname `cron-cleanup.yml` mit Inhalt:

```yaml
name: Backend Housekeeping

on:
  schedule:
    - cron: '0 */6 * * *'
  workflow_dispatch:

jobs:
  cleanup:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Trigger backend cleanup
        env:
          BACKEND_URL: https://backend-production-c327.up.railway.app
          ADMIN_TOKEN: ${{ secrets.BACKEND_ADMIN_TOKEN }}
        run: |
          if [ -z "$ADMIN_TOKEN" ]; then
            echo "::error::BACKEND_ADMIN_TOKEN secret is not set"; exit 1
          fi
          response=$(curl -sS -w "\nHTTP_CODE:%{http_code}" -X POST \
            -H "Authorization: Bearer $ADMIN_TOKEN" \
            "$BACKEND_URL/admin/cron/cleanup")
          code=$(echo "$response" | grep -oE 'HTTP_CODE:[0-9]+' | cut -d':' -f2)
          body=$(echo "$response" | sed '/HTTP_CODE:/d')
          echo "Status: $code"; echo "Body: $body"
          [ "$code" = "200" ] || { echo "::error::Cleanup failed $code"; exit 1; }
```

### 3. Workflow für Daily Backup (JSON-Artifact, 90 Tage retention)

Dateiname `daily-backup.yml`:

```yaml
name: Daily DB Backup

on:
  schedule:
    - cron: '0 3 * * *'
  workflow_dispatch:

jobs:
  backup:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Fetch backup
        env:
          BACKEND_URL: https://backend-production-c327.up.railway.app
          ADMIN_TOKEN: ${{ secrets.BACKEND_ADMIN_TOKEN }}
        run: |
          [ -n "$ADMIN_TOKEN" ] || { echo "::error::token missing"; exit 1; }
          date_str=$(date -u +%Y-%m-%d)
          out="herzblatt-backup-${date_str}.json"
          code=$(curl -sS -o "$out" -w '%{http_code}' \
            -H "Authorization: Bearer $ADMIN_TOKEN" \
            "$BACKEND_URL/admin/backup.json")
          echo "HTTP: $code"
          [ "$code" = "200" ] || { cat "$out"; exit 1; }
          python3 -c "import json; d=json.load(open('$out')); assert d.get('exported_at'); print('OK:', d['counts'])"
      - name: Upload as artifact
        uses: actions/upload-artifact@v4
        with:
          name: herzblatt-backup-${{ github.run_id }}
          path: herzblatt-backup-*.json
          retention-days: 90
```

**Alternativ zu beiden:** nutze cron-job.org (ein Konto, zwei Jobs einstellen, fertig).

---

## 💶 Purchases-Endpoint (neu committed — wartet auf Deploy)

Nach Deploy verfügbar:
- `GET /herzraum/purchases?limit=100` (Session-Cookie) → JSON mit Items + Stats
- Frontend-Proxy `/api/herzraum/purchases`

Response-Shape:
```json
{
  "total": 47, "paid": 42, "refunded": 3, "chargeback": 2,
  "revenue_cents": { "all": 423800, "paid": 377958, "refunded": 26997 },
  "items": [
    { "id": 47, "provider": "digistore24", "orderId": "...",
      "email": "...", "product": "ebook", "amountCents": 8999,
      "currency": "EUR", "status": "paid", "createdAt": "..." }
  ]
}
```

Kann als Basis für einen "Verkäufe"-Tab im Herzraum-Dashboard-UI dienen.

---

## 🧪 Verify-Commands nach Deploy

```bash
# Smoke-Test gegen Prod:
cd /tmp/herzblatt-deploy
./scripts/smoke-test.sh

# Mit Admin-Bearer (zeigt mehr Tests):
ADMIN_TOKEN=575862173bd7f57815a93a5a0a936ef3ed0c9dc2dfc56022be5244c75c3b8fe2 ./scripts/smoke-test.sh

# Metrics direkt schauen:
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://backend-production-c327.up.railway.app/admin/metrics | python3 -m json.tool

# Backup manuell ziehen:
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://backend-production-c327.up.railway.app/admin/backup.json \
  -o backup-$(date +%Y-%m-%d).json

# SendGrid-Status (wenn konfiguriert):
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://backend-production-c327.up.railway.app/admin/sendgrid/status

# Cron manuell triggern:
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://backend-production-c327.up.railway.app/admin/cron/cleanup
```

---

## 🗂 DATEIEN neu in dieser Session

```
apps/backend/src/
├── db/
│   ├── migrate.ts              ← Runtime-Migrations (CREATE TABLE IF NOT EXISTS)
│   └── schema.ts               ← purchases-Tabelle ergänzt
├── lib/
│   ├── sentry.ts               ← Sentry-Init + Helpers
│   └── sendgrid.ts             ← SG-Client (fetch-based, no-op ohne API-Key)
└── routes/
    ├── digistore-ipn.ts        ← Digistore24-Webhook mit SHA-512-Sig
    ├── admin/
    │   ├── cron-cleanup.ts     ← GET+POST cleanup endpoint
    │   ├── metrics.ts          ← observability JSON
    │   ├── backup.ts           ← full JSON snapshot
    │   └── sendgrid.ts         ← SG admin ops

apps/frontend/src/lib/sentry.ts  ← Frontend-Sentry-Helper

scripts/smoke-test.sh            ← 19-Test-Suite für Prod

docs/plans/2026-04-18-PHASE-2-STATUS.md  ← dieses Dokument
```

## 📝 COMMITS (diese Session, chronologisch)

```
230345a feat: Unsubscribe-Flow mit HMAC-Token + RFC8058 One-Click-Header
226075d feat(admin): GDPR-Delete/Export + CSV-Export für Purchases
58fc389 feat(tracking): ebook-buy + ebook-waitlist als Click-Targets
d843c81 feat(frontend): Verkäufe-Tab im Herzraum + Digistore-Buy-Button
d8892e2 test(backend): 12 Unit-Tests für crypto.hashIp + getClientIp
ff013cc test(backend): 10 Unit-Tests für verifyDigistoreSignature
58fa54b docs: GH-Actions-Workflow-YAMLs + Purchases-Endpoint in Status-Doc
c276a12 feat(herzraum): purchases endpoint + frontend proxy
3cbdce5 docs(plans): Phase 2 status + Klick-Guide für User
ce8025c chore: force railway deploy attempt #3
cf9f5cb fix(backend): non-blocking startup migrations
ea4a8f5 chore: trigger Railway rebuild
6cdc7b2 feat: SendGrid + Admin-Metrics + Backup + Digistore24-Webhook
f0b012e feat(observability): Sentry integration + Cron-Cleanup-Endpoint
55c3c36 fix(proxy): defensive error handling + response buffering  [letzter live]
```

---

## 🆕 ZUSÄTZLICH in zweiter autonomer Session gebaut

### Herzraum-Dashboard
- **Neue Seite `/herzraum/verkaeufe`** — Live-KPIs + Tabelle + Auto-Refresh 30s
- Euro-Icon + Nav-Eintrag im HerzraumLayout
- Setup-Hinweis-Card für Digistore24-Config

### E-Book-Page
- **Bedingter Buy-Button** — wenn `DIGISTORE_BUY_URL` env gesetzt ist, wechselt
  von Warteliste-Form zu direktem D24-Kauf-Link
- Click-Tracking via `sendBeacon` (überlebt Weiterleitung zu D24)
- Waitlist trackt Conversion-Event nach Newsletter-Success

### Admin-Endpoints (alle Bearer-ADMIN_TOKEN)
- **`/admin/gdpr/delete`** — DSGVO-Delete (hart für Subscribers/Registrations,
  anonymisiert Purchases wegen HGB §257 10-Jahres-Pflicht)
- **`/admin/gdpr/export`** — Art. 15 DSGVO Auskunft (JSON alle Daten zu email)
- **`/admin/purchases.csv`** — CSV für Steuerberater/Buchhaltung

### Public-Endpoints
- **`/unsubscribe`** (GET HTML + POST JSON) mit HMAC-Token
  - Token = HMAC-SHA256(email, UNSUBSCRIBE_SECRET).slice(0, 32)
  - Timing-safe compare
  - Idempotent + hübsche HTML-Page
- Frontend-Proxy `/api/unsubscribe`

### SendGrid-Verbesserungen
- **RFC 8058 One-Click-Unsubscribe** Header (`List-Unsubscribe` +
  `List-Unsubscribe-Post`) → Gmail/Outlook zeigen native Unsub-Button
- Welcome-Mail enthält jetzt klickbaren Abmelde-Link
- Dynamic-Template bekommt `unsubscribe_url` als Variable

### Unit-Tests (22 Tests, alle grün lokal)
- 10× `verifyDigistoreSignature` (happy path, tampering, edge cases)
- 12× `hashIp` + `getClientIp` (determinism, salt, fallbacks)

### Click-Tracking
- Whitelist erweitert: `ebook-buy`, `ebook-waitlist`
- Damit im `/herzraum/klicks`-Dashboard messbar

---

## 📦 KOMPLETTE DATEI-LISTE (diese 2 Sessions zusammen)

```
apps/backend/src/
├── db/
│   ├── migrate.ts              ← Runtime-Migrations
│   └── schema.ts               ← purchases-Tabelle
├── lib/
│   ├── sentry.ts               ← Sentry-Init
│   ├── sendgrid.ts             ← SG-Client (+ unsub-link builder)
│   └── crypto.test.ts          ← 12 Tests
└── routes/
    ├── digistore-ipn.ts        ← IPN + SHA-512 Sig-Verify
    ├── digistore-ipn.test.ts   ← 10 Tests
    ├── unsubscribe.ts          ← HMAC-Token-basiert
    ├── track-click.ts          ← +ebook-buy/waitlist Whitelist
    ├── newsletter.ts           ← + SendGrid fire-and-forget
    ├── herzraum/
    │   └── purchases.ts        ← neue Session-Auth-Route
    └── admin/
        ├── cron-cleanup.ts
        ├── metrics.ts
        ├── backup.ts
        ├── sendgrid.ts
        ├── gdpr.ts
        └── purchases-csv.ts

apps/frontend/src/
├── lib/sentry.ts
├── layouts/HerzraumLayout.astro  ← +Verkäufe-Tab im Nav
├── pages/
│   ├── ebook.astro                ← +konditional D24-Button
│   ├── api/
│   │   ├── unsubscribe.ts         ← Proxy
│   │   └── herzraum/purchases.ts  ← Proxy
│   └── herzraum/verkaeufe.astro  ← neue Dashboard-Seite

scripts/smoke-test.sh              ← 21-Test-Suite

docs/plans/2026-04-18-PHASE-2-STATUS.md  ← dieses Dokument
```

---

## 🚧 NOCH OFFEN (für später, wenn Zeit)

- Custom-Domain `api.herzblatt-journal.com` → DNS-CNAME zu Railway
- SendGrid Dynamic-Template (schöneres Design als HTML-Fallback)
- Integration-Tests gegen Live-Prod (nach Deploy)
- Stripe-Webhook parallel zu Digistore24 (falls zweites Payment-System gewünscht)
- Dashboard-Startseite um Purchases-KPIs erweitern
- GDPR-Workflow-UI im Admin-Dashboard (aktuell nur via curl)
