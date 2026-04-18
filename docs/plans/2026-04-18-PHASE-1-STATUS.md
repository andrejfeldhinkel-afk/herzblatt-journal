# Phase 1 Backend-Split — Gesamt-Status (Stand 2026-04-18)

## ✅ WAS FERTIG IST

### Backend-Service (live auf `backend-production-c327.up.railway.app`)
- 19 API-Endpoints registriert
- Postgres-DB angelegt, 7 Tabellen + 13 Indexes
- Session-Management funktional (Cookie `hz_session`, Domain-scoped)
- ENV-Vars auf Railway gesetzt: `HERZRAUM_PASSWORD`, `IP_SALT`, `ADMIN_TOKEN`, `COOKIE_DOMAIN`, `DATABASE_URL`
- Live-getestet: alle Public-Routes, Auth-Login/Logout/Verify, Admin-Routes mit Bearer

### Frontend-Code (gepusht, Commit `5f5b296`)
- Alle 16 `/api/*` Routes sind jetzt Backend-Proxies
- Middleware ruft `/auth/verify` vom Backend
- Login-Page (`/herzraum/login`) ruft Backend-Auth
- Alte ephemeral lib-Files gelöscht (`herzraum-auth.ts`, `herzraum-data.ts`)
- **NICHT DEPLOYED** — Railway-Webhook hat nicht getriggert

## ⚠ WAS DU JETZT TUN MUSST

### 1. Railway-Frontend-Redeploy manuell triggern

Railway-Token wurde gelöscht — ich kann nicht via API triggern. Du:

1. https://railway.com/dashboard
2. Projekt **Herzblatt-Journal**
3. Service **herzblatt-journal** (Frontend)
4. Tab **Deployments**
5. Obersten Eintrag finden → **⋮** (Drei-Punkte-Menü) → **Redeploy**
   - **ODER** oben rechts blauer Button **"Deploy"** falls sichtbar

Alternativ: Klick auf **"Deploy"**-Tab links → **"Deploy from GitHub"** wieder auswählen.

Build dauert ~15 Min.

### 2. Danach Live-Test

```bash
# Test-Command nach erfolgreichem Frontend-Deploy:
curl -X POST -H "Content-Type: application/json" \
  -d '{"path":"/test-phase-1f"}' \
  https://herzblatt-journal.com/api/pageview
# Erwarte: {"ok":true}  (kommt vom Backend via Frontend-Proxy)
```

Wenn Response nicht `{"ok":true}` oder ein Error → Phase 1f ist noch nicht live.

### 3. Im Browser Dashboard testen

Nach erfolgreichem Frontend-Deploy:

1. https://herzblatt-journal.com/herzraum/login
2. Passwort: **`bzVSAuyQ5RMpOsbR2xJ9HDxJ`**
3. Nach Login → Dashboard-Overview mit KPIs

Wichtig: Der Cookie `hz_session` hat `Domain=.herzblatt-journal.com`. Funktioniert **NUR** auf der herzblatt-journal.com-Domain (nicht auf railway-subdomain).

## 📋 SESSION-COMMITS

```
5f5b296 chore: trigger Railway frontend rebuild for Phase 1f
9a6cc0e fix(frontend): Prod-Default-Backend-URL (fallback auf railway-default)
2db924f Merge: Phase 1f — Frontend-API als Backend-Proxies
f83f76a Merge: Phase 1d — Auth + Herzraum Admin-Routes + Admin CSV
697158b fix(backend): schema-import mit .js-Extension für ESM-Build
2d9b3ec Merge: Phase 1c — 5 public API-Routes im Backend
b9573cd Merge: Phase 1a — Backend-Scaffold (Hono + Drizzle + Schema)
e496a2d Merge: Phase 0 — Monorepo-Umbau
```

## 🔐 SECRETS (in Railway-ENV gesetzt — diese NICHT committen!)

```
HERZRAUM_PASSWORD = bzVSAuyQ5RMpOsbR2xJ9HDxJ
IP_SALT           = f23d4acb781c822516e8c63e0a94474a
ADMIN_TOKEN       = 575862173bd7f57815a93a5a0a936ef3ed0c9dc2dfc56022be5244c75c3b8fe2
POSTGRES_PASSWORD = e7147daa8a429bdaa6c4d49157ef9de8
DATABASE_PUBLIC_URL = postgresql://postgres:<pw>@nozomi.proxy.rlwy.net:13270/herzblatt
```

Speichere die an einem sicheren Ort (z.B. 1Password).

## 🚧 NOCH OFFEN

- **DNS-CNAME** für `api.herzblatt-journal.com` → `qbfw3bau.up.railway.app` bei deinem Registrar
  (Optional — funktioniert alles auch über Proxy, aber custom domain ist sauberer)
- **Phase 1e** (Legacy-CSV-Import) — nicht gemacht, weil keine Legacy-Daten mehr auf Railway vorhanden waren
  (Railway-Filesystem ist ephemer — nach Backend-Split ist `data/subscribers.csv` leer)

## 🗄️ BACKEND-API-ROUTEN (zur Referenz)

### Public (kein Auth, Rate-Limit 60/min shared)
- `POST /pageview` — Body: `{path, referrer?}` → inserts pageviews
- `POST /track-click` — Body: `{site|target, source?}` → inserts clicks (whitelist)
- `POST /newsletter` — Body: `{email, source?}` → inserts subscribers (unique)
- `POST /register` — Proxy zu xLoves + inserts registrations bei Success
- `GET  /readers` — Gibt simulierten Reader-Count zurück
- `GET  /health` — `{ok:true}`
- `GET  /` — Text-Welcome

### Auth (eigene Security)
- `POST /auth/login` — Body: `{password}` → Set-Cookie `hz_session`
- `POST /auth/logout` + `GET /auth/logout` — Clear Cookie
- `GET  /auth/verify` — 200 wenn gültig, sonst 401

### Herzraum (Cookie-Auth, 24h TTL)
- `GET  /herzraum/stats?range=today|7d|30d|90d` — Aggregierte KPIs
- `GET  /herzraum/clicks/sources?days=N` — Top Quellartikel für Klicks
- `GET  /herzraum/newsletter/list?mask=true|false` — Abonnenten
- `GET  /herzraum/newsletter/export` — CSV-Download (volle E-Mails)
- `GET  /herzraum/readers/list` — Registrierungen + NL-Overlap
- `GET  /herzraum/data/export` — JSON-Bundle alle Daten
- `POST /herzraum/data/clear` — Body: `{target}` → löscht pageviews/clicks/registrations
- `POST /herzraum/password/verify` — Body: `{password}` → Passwort-Check

### Admin (Bearer-Auth via ADMIN_TOKEN)
- `GET  /admin/subscribers.csv` — Volle Subscriber-CSV für Export-Scripts

## 🧪 FINAL SANITY-CHECK (bereits durchgeführt am 2026-04-18)

**Backend direkt:**
- `/health` → 200 ✓
- `/pageview` → {ok:true} ✓ (DB-Row geschrieben)
- `/track-click` → {ok:true} ✓
- `/newsletter` → Willkommen + dedupe ✓
- `/readers` → Counter ✓
- `/auth/login` mit richtigem PW → 200 + Set-Cookie ✓
- `/auth/login` mit falschem PW → 401 ✓
- `/herzraum/stats` mit Cookie → 200 mit KPIs (2 pv, 2 clicks, 2 subs) ✓
- `/herzraum/stats` ohne Cookie → 401 ✓
- `/admin/subscribers.csv` mit Bearer → 200 CSV ✓
- `/admin/subscribers.csv` ohne Bearer → 401 ✓
- `/auth/logout` → Clear Cookie ✓

**Frontend-Proxies:** nach Deploy testbar (siehe oben).

## NÄCHSTE SCHRITTE (nach Frontend-Deploy)

1. Dashboard-UI im Browser testen (Login, Stats anschauen, Newsletter-Export)
2. Pexels-Bilder für neue Artikel (aus Herzblatt-Content-Skill)
3. SendGrid-Integration (siehe `memory/project_sendgrid_todo.md`)
4. E-Book-Checkout anbinden (Digistore24 o.ä.)
