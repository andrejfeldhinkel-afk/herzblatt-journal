# Herzraum — Admin Dashboard

Passwort-geschütztes Admin-Dashboard für herzblatt-journal.com. Erreichbar unter `/herzraum`.

## Setup (einmalig)

### 1. Passwort + Salts auf Railway setzen

Railway Dashboard → Projekt **Herzblatt-Journal** → **Variables** → Add:

```
HERZRAUM_PASSWORD=<mindestens 8 Zeichen, empfohlen 20+>
IP_SALT=<openssl rand -hex 16>
ADMIN_TOKEN=<openssl rand -hex 32>
```

Railway deployed nach dem Setzen automatisch neu (~3 Min).

### 2. Zugriff testen

```
https://herzblatt-journal.com/herzraum
```

→ Login-Page → Passwort eingeben → Dashboard öffnet sich.

### 3. Session-Verhalten

- **Session-Dauer:** 24 Stunden (danach Auto-Logout)
- **Rate-Limit:** Max 5 fehlgeschlagene Login-Versuche pro IP in 10 Min
- **Cookie:** `hz_session` (HttpOnly, Secure, SameSite=Strict)

---

## Dashboard-Struktur

| Route | Zweck |
|---|---|
| `/herzraum` | Overview: KPIs, Traffic-Chart, Top-Artikel, Top-Referrer, Aktivität |
| `/herzraum/artikel` | Artikel-Management: 1800+ Artikel mit Filter, Suche, Autor-Pie |
| `/herzraum/traffic` | Traffic-Deep-Dive: pro Tag, Wochentag, Stunde, CSV-Export |
| `/herzraum/klicks` | Affiliate-Klicks: pro Tag, nach Target, Quell-Artikel |
| `/herzraum/newsletter` | Abonnenten, Wachstums-Chart, CSV-Export |
| `/herzraum/leser` | Registrierte User + Newsletter-Überlappung |
| `/herzraum/einstellungen` | Passwort-Check, Daten-Export, Cache leeren, Gefahrenzone |

Alle Pages laden ihre Daten von `/api/herzraum/stats` (autom. Refresh alle 60s auf dem Overview).

---

## Datenhaltung

**Persistenz:** JSON-Dateien in `data/` Ordner (gitignored, DSGVO-konform).

| Datei | Inhalt |
|---|---|
| `pageviews.json` | Array `{ts, path, referrer, ua}` |
| `clicks.json` | Array `{ts, target, source, type}` |
| `registrations.json` | Array `{ts, email, source}` |
| `subscribers.csv` | Newsletter (separate CSV aus newsletter.ts) |
| `sessions.json` | Aktive Admin-Sessions (Token-Hashes) |
| `login-attempts.json` | Rate-Limit Log (IP-Hash) |
| `daily-stats.json` | Optional: pre-aggregierte Daily Stats |

### ⚠ Railway-Filesystem ist flüchtig

Bei **jedem Git-Push** zu main löscht Railway alle Runtime-Dateien.
Das heißt: **Pageviews, Klicks, Registrierungen gehen bei Redeploys verloren.**

**Workaround:**
1. Regelmäßig `Einstellungen → Daten-Export` verwenden (JSON-Backup)
2. Newsletter separat via `scripts/pull-subscribers.sh`
3. Langfristig: Railway Volume (persistent disk) oder Supabase/Postgres einrichten

---

## Security

### Prüfmechanismen
- ✅ Middleware blockiert alle `/herzraum/*` und `/api/herzraum/*` ohne gültige Session
- ✅ Session-Token als SHA-256-Hash gespeichert (Leak sessions.json ≠ Login möglich)
- ✅ Timing-safe Passwort-Vergleich
- ✅ Rate-Limit: 5 Fehlversuche/10 Min/IP
- ✅ IP nur gehasht (DSGVO-konform)
- ✅ `/herzraum/*` in `robots.txt` disallowed
- ✅ `/herzraum/*` aus Sitemap ausgeschlossen
- ✅ `<meta name="robots" content="noindex, nofollow">` auf Login + Layout

### Was NICHT gemacht wird
- Keine öffentlichen Links auf `/herzraum` (nirgends im Code referenziert)
- Keine Passwort-Reset per E-Mail (zu riskant bei Ein-Admin-Setup)
- Keine 2FA (kann bei Bedarf später ergänzt werden)

### Passwort ändern
`HERZRAUM_PASSWORD` in Railway ENV editieren. Alle offenen Sessions sind danach weiter gültig (sie stehen in `sessions.json`). Für Force-Logout aller Sessions: per SSH `data/sessions.json` auf `[]` setzen oder in Einstellungen → Daten-Export → Cache leeren.

---

## APIs

### Öffentlich (schreiben Events)
- `POST /api/pageview` — Body: `{path, referrer?}` → appended `pageviews.json`
- `POST /api/track-click` — Body: `{site|target, source?}` → appended `clicks.json`
- `POST /api/register` — Forwarded to be.xloves.com; Success appended `registrations.json`
- `POST /api/newsletter` — Appended `subscribers.csv` (siehe separate `data/README.md`)

### Geschützt (Herzraum-Session required)
- `GET /api/herzraum/stats?range=today|7d|30d|90d` — Aggregierte KPIs
- `GET /api/herzraum/clicks/sources?days=30` — Klicks nach Quell-Artikel
- `GET /api/herzraum/newsletter/list?mask=true|false` — Abonnenten (default maskiert)
- `GET /api/herzraum/newsletter/export` — CSV-Download (volle E-Mails)
- `GET /api/herzraum/readers/list?mask=true|false` — Registrierte User
- `GET /api/herzraum/data/export` — JSON-Bundle aller Daten
- `POST /api/herzraum/data/clear` — Body: `{target: 'pageviews'|'clicks'|'registrations'|'daily-stats'}`
- `POST /api/herzraum/password/verify` — Body: `{password}` → 200 ok / 401 falsch

### Auth
- `POST /api/herzraum/auth` — Body: `{password}` → Set-Cookie `hz_session`
- `GET|POST /api/herzraum/logout` — Clear Cookie, destroy session

---

## Entwicklung lokal

```bash
# .env.example kopieren
cp .env.example .env

# Passwort eintragen:
echo 'HERZRAUM_PASSWORD=test12345678' >> .env
echo 'IP_SALT=localdev' >> .env

# Starten
npm run dev

# Browser: http://localhost:4321/herzraum
```

---

## Troubleshooting

**Login funktioniert nicht (503)**
→ `HERZRAUM_PASSWORD` ist auf Railway nicht gesetzt oder < 8 Zeichen.

**Login funktioniert nicht (429)**
→ Rate-Limit. 10 Min warten oder in `data/login-attempts.json` den IP-Hash entfernen.

**Dashboard zeigt keine Daten**
→ Nach Redeploy ist `data/*.json` leer. Warten, bis neue Events eintrudeln. Events kommen rein, sobald Pages aufgerufen werden.

**"Unauthorized" obwohl eingeloggt**
→ Session abgelaufen (>24h) oder Cookie nicht gesendet (z.B. bei HTTP statt HTTPS). Browser-Cookie prüfen.

---

## TODO / Improvements

- [ ] Railway Volume einrichten für persistente Daten
- [ ] 2FA optional (TOTP) ergänzen
- [ ] SendGrid-Integration im Newsletter (siehe `memory/project_sendgrid_todo.md`)
- [ ] Feed der Top-Articles mit echten Titeln (statt nur Slug)
- [ ] Echtzeit-WebSocket für live Pageviews im Dashboard
