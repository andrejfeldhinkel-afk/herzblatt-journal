# PWA + Push Notifications — Setup-Guide

Kurzer Einrichtungs-Guide damit die App-Funktion (installierbare PWA mit Push-Nachrichten)
live geht.

## Was wurde implementiert?

**Frontend (apps/frontend):**
- `public/manifest.json` — Web App Manifest (App-Name, Icons, Shortcuts)
- `public/sw.js` — Service Worker (Offline-Cache + Push-Empfang)
- `public/offline.html` — Offline-Fallback-Seite
- `public/icons/icon-{192,512}.png` + maskable — PWA-Icons
- `public/apple-touch-icon.png` — iOS Home-Screen Icon
- `src/components/PushPrompt.astro` — Floating Banner "Aktivieren" (zeigt nach 3 Seitenaufrufen)
- `src/layouts/BaseLayout.astro` — SW-Registrierung + PWA Meta-Tags
- API-Proxies: `/api/push/{vapid,subscribe,unsubscribe}` + `/api/herzraum/push/{stats,broadcast}`

**Backend (apps/backend):**
- `src/lib/web-push.ts` — VAPID-Signierung + aes128gcm-Verschlüsselung (ohne NPM-Dep)
- `src/routes/push.ts` — Public-Endpoints (`/push/vapid`, `/push/subscribe`, `/push/unsubscribe`)
- `src/routes/herzraum/push.ts` — Admin-Endpoints (`/stats`, `/broadcast`)
- DB-Schema: `push_subscriptions` + `push_broadcasts` (auto-migriert beim Start)

**Admin-UI (apps/frontend/src/pages/herzraum/push.astro):**
- KPIs: aktive App-Nutzer, Neuzugänge 7d/30d, total
- Growth-Chart (30 Tage)
- Composer mit Live-Preview + Dry-Run
- Versand-History
- VAPID-Warn-Banner wenn Keys fehlen

## Setup

### 1. VAPID-Keys generieren (einmalig)

```bash
cd apps/backend
pnpm exec tsx scripts/generate-vapid.ts
```

Das Script gibt 3 Zeilen aus:
```
VAPID_PUBLIC_KEY=B...
VAPID_PRIVATE_KEY=a...
VAPID_SUBJECT=mailto:andrej@leadpartner.net
```

### 2. Env-Vars in Railway setzen

Im **backend**-Service (ID `74114171-75cf-4887-ab82-92bd5a1d6478`):

- `VAPID_PUBLIC_KEY` — aus Schritt 1
- `VAPID_PRIVATE_KEY` — aus Schritt 1 **(niemals committen!)**
- `VAPID_SUBJECT` — `mailto:andrej@leadpartner.net`

### 3. Backend neu deployen

Railway triggert das normalerweise automatisch bei Env-Var-Änderung. Sonst manuell:

```bash
TOKEN="<railway-token>"
curl -s https://backboard.railway.com/graphql/v2 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation{serviceInstanceDeploy(environmentId:\"a963e080-5126-44ed-8006-f3660e0d558d\",serviceId:\"74114171-75cf-4887-ab82-92bd5a1d6478\",latestCommit:true)}"}'
```

Beim Start werden die DB-Tabellen (`push_subscriptions`, `push_broadcasts`) automatisch angelegt
(via `runStartupMigrations()` in `migrate.ts` — idempotent, `CREATE TABLE IF NOT EXISTS`).

### 4. Frontend deployen

Gleiche Prozedur für den **herzblatt-journal**-Service (ID `2ba94434-40c7-4d58-b8eb-069952ee9460`):

```bash
curl -s https://backboard.railway.com/graphql/v2 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation{serviceInstanceDeploy(environmentId:\"a963e080-5126-44ed-8006-f3660e0d558d\",serviceId:\"2ba94434-40c7-4d58-b8eb-069952ee9460\",latestCommit:true)}"}'
```

### 5. Prüfen

- https://herzblatt-journal.com/manifest.json → sollte die neuen Icons + Shortcuts zeigen
- https://herzblatt-journal.com/sw.js → sollte den Service-Worker-Code liefern
- Browser-DevTools → Application → Manifest → "Installable" sollte grün sein
- `/herzraum/push` → VAPID-Warnung sollte weg sein, KPIs laden

## User-Journey

1. User besucht herzblatt-journal.com → SW wird automatisch installiert (silent)
2. Ab Seite 3 erscheint das PushPrompt-Banner "Neue Artikel zuerst lesen?"
3. User klickt "Aktivieren" → Browser-Permission-Dialog
4. Browser holt VAPID-PublicKey via `/api/push/vapid` und subscribed
5. Subscription wird an `/api/push/subscribe` gePOSTet → in DB gespeichert
6. Ab jetzt: Push-Nachrichten vom Admin erreichen den User auch wenn der Browser zu ist

## Push-Nachricht senden (täglicher Flow)

1. Login in `/herzraum/login`
2. `/herzraum/push` öffnen
3. Titel + Body + Link-Ziel eingeben
4. **Trocken-Test** klicken → zeigt, an wie viele Nutzer gesendet würde
5. **An alle aktiven Nutzer senden** → Bestätigungs-Dialog → Versand
6. Unten in der Versand-History das Ergebnis: Zugestellt / Fehler

**Failure-Handling:** Bei 404/410 (User hat Browser-Permission widerrufen oder Gerät abgelöst)
wird die Subscription automatisch als `disabled` markiert und nicht mehr berücksichtigt.

## iOS-Hinweis (wichtig)

- **Web-Push auf iOS funktioniert erst ab iOS 16.4** (Safari) und **nur wenn der User die
  Seite vorher zum Home-Screen hinzugefügt hat**. Also: iOS-User installieren die PWA
  explizit (Safari Share → "Zum Home-Bildschirm"), und dann klappt Push.
- **Android/Chrome/Firefox:** Push klappt direkt, auch ohne Installation.

## Kosten

- **0 €** — Web-Push läuft über die nativen FCM/Mozilla/Apple-Push-Endpoints, kostenlos.
- Keine externen Services wie OneSignal, Firebase-SDK o.ä. nötig.

## Datenschutz

- Was wird gespeichert: Push-Endpoint-URL, Public-Key, Auth-Secret, User-Agent, Sprache
- **Keine** Klartext-E-Mail, **kein** Name, **keine** IP
- Unsubscribe jederzeit via `/api/push/unsubscribe` (entfernt Eintrag)
- DSGVO: PWA-Install + Push-Subscription geschieht erst nach **explicit Opt-In** (Banner-Klick + Browser-Permission)

Eintrag in `/datenschutz.astro` ergänzen:

> **Push-Benachrichtigungen:** Sofern du unserer Aufforderung zur Aktivierung von Push-Benachrichtigungen zugestimmt hast, speichern wir eine technische Kennung deines Browsers oder Endgeräts (Push-Endpoint-URL, öffentlicher Schlüssel, Auth-Secret), um dir neue Artikel zuzustellen. Keine Verknüpfung mit anderen personenbezogenen Daten. Abmeldung jederzeit in den Browser-Einstellungen oder per Widerruf auf der Website.
