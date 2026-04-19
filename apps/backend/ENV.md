# Backend Environment Variables

Komplette Liste aller vom Backend erwarteten Environment-Variablen, gruppiert
nach Zweck. Secrets werden immer nur in Railway (Backend-Service) gesetzt,
**niemals** ins Repository committet.

Alle Werte werden via `process.env.*` gelesen — keine .env-Datei wird geladen
(dotenv wird nur im Dev genutzt, siehe `apps/backend/package.json`).

---

## Kernsystem

| Variable | Pflicht | Zweck |
| --- | --- | --- |
| `DATABASE_URL` | Ja | Postgres-Connection-String (Railway stellt ihn bereit) |
| `PORT` | Nein (default `3001`) | HTTP-Port |
| `HOST` | Nein (default `0.0.0.0`) | Bind-Host |
| `NODE_ENV` | Nein (default `production`) | Node-Env — steuert u.a. Sentry-Env |
| `ALLOWED_ORIGINS` | Ja | Komma-separierte Liste erlaubter Frontend-Origins für CORS |
| `RAILWAY_GIT_COMMIT_SHA` | Automatisch | Wird von Railway gesetzt, `/health` zeigt erste 7 Zeichen als `version` |

## Sessions / Auth

| Variable | Pflicht | Zweck |
| --- | --- | --- |
| `SESSION_SECRET` | Ja | HMAC-Key für Session-Cookies |
| `ADMIN_PASSWORD` | Ja | Passwort für `/auth/login` (Herzraum-Admin) |
| `ADMIN_API_TOKEN` | Ja | Bearer-Token für `/admin/*` (externe Admin-Calls) |

## Sentry (optional)

| Variable | Pflicht | Zweck |
| --- | --- | --- |
| `SENTRY_DSN` | Nein | Aktiviert Error-Reporting zu Sentry |
| `SENTRY_ENV` | Nein | Überschreibt NODE_ENV für Sentry-Tagging |
| `SENTRY_TRACES_SAMPLE_RATE` | Nein (default `0.05`) | Performance-Sampling |

---

## Payment-Provider

### Digistore24 — IPN-Webhook (`POST /digistore-ipn`)

| Variable | Pflicht | Zweck |
| --- | --- | --- |
| `DIGISTORE_IPN_PASSPHRASE` | Ja (Prod) | Passphrase aus dem Digistore-Account (signiert per SHA-512) |
| `DIGISTORE_DISABLE_SIGNATURE` | Nein | `1` schaltet Signatur-Check ab — **nur Test/Dev**, nie in Prod |

Setup in Railway-Backend-Service. In Digistore24 unter
*Produkt → Connect an external service* die Webhook-URL auf
`https://<backend>.up.railway.app/digistore-ipn` setzen und dieselbe
Passphrase im Digistore-Account eintragen.

### Whop — Webhook (`POST /api/webhooks/whop`)

| Variable | Pflicht | Zweck |
| --- | --- | --- |
| `WHOP_API_KEY` | Nein (aktuell) | Reserviert für Server-zu-Server-Calls (noch nicht genutzt) |
| `WHOP_PLAN_ID_EBOOK` | Nein (aktuell) | Reserviert für Embed-Checkout-Konfiguration |
| `WHOP_WEBHOOK_SECRET` | Ja (Prod) | HMAC-SHA256-Secret aus dem Whop-Dashboard |
| `WHOP_DISABLE_SIGNATURE` | Nein | `1` schaltet Signatur-Check ab — **nur Test/Dev**, nie in Prod |

**Wichtig (Security-Fix April 2026):** Ist weder `WHOP_WEBHOOK_SECRET` noch
`WHOP_DISABLE_SIGNATURE=1` gesetzt, weist der Endpoint alle Webhooks mit
HTTP 500 ab (fail-closed). Vorher wurde ohne Secret eine Warnung geloggt und
der Payload trotzdem angenommen — das war eine Lücke.

Setup in Railway-Backend-Service. Im Whop-Dashboard unter
*Developer → Webhooks* die URL
`https://<backend>.up.railway.app/api/webhooks/whop` hinzufügen und das
generierte Secret hier als `WHOP_WEBHOOK_SECRET` eintragen.

### Micropayment — Checkout + Webhook

Checkout-URL-Generator: `POST /api/checkout/micropayment`
Bezahl-Benachrichtigung: `POST /api/webhooks/micropayment`

| Variable | Pflicht | Zweck |
| --- | --- | --- |
| `MICROPAYMENT_PROJECT_KEY` | Ja | Projekt-Schlüssel aus dem Micropayment-Dashboard |
| `MICROPAYMENT_ACCESS_KEY` | Ja | Access-Key, dient als Signing-Secret (MD5-Scheme) |
| `MICROPAYMENT_TEST_MODE` | Nein (default `1`) | `1` = Testmodus, `0` = Live |
| `MICROPAYMENT_DISABLE_SIGNATURE` | Nein | `1` schaltet Webhook-Signatur-Check ab — **nur Test/Dev** |

Setup in Railway-Backend-Service. Im Micropayment-Dashboard die Webhook-URL
auf `https://<backend>.up.railway.app/api/webhooks/micropayment` setzen.
Derselbe Access-Key muss hier und im Dashboard eingetragen sein.

---

## SendGrid (Email-Versand bei Kauf)

| Variable | Pflicht | Zweck |
| --- | --- | --- |
| `SENDGRID_API_KEY` | Nein | Wenn gesetzt: Käufer werden zur Liste hinzugefügt + Welcome-Mail |
| `SENDGRID_LIST_ID` | Nein | UUID der Ziel-Liste (optional) |
| `SENDGRID_FROM_EMAIL` | Nein | Verified-Sender-Email |
| `SENDGRID_FROM_NAME` | Nein | Absender-Name (default "Herzblatt Journal") |
| `SENDGRID_WELCOME_TEMPLATE_ID` | Nein | Dynamic-Template-ID, sonst Plaintext |
| `SENDGRID_PARSE_KEY` | Nein | Shared Secret für Inbound-Parse |
| `PUBLIC_BASE_URL` | Nein | Basis für Unsubscribe-Links |

---

## Push Notifications (Web-Push)

| Variable | Pflicht | Zweck |
| --- | --- | --- |
| `VAPID_PUBLIC_KEY` | Ja (für Push) | Public-VAPID-Key |
| `VAPID_PRIVATE_KEY` | Ja (für Push) | Private-VAPID-Key |
| `VAPID_SUBJECT` | Ja (für Push) | `mailto:...` oder Domain |

---

## Sicherheit — Regeln

- **Niemals committen:** `.env`, `.env.local`, `.env.production` — `.gitignore`
  deckt das ab, aber bitte vor jedem `git add -A` doppelt checken.
- **Secrets rotieren** wenn ein Dev-Account deaktiviert wird oder ein Leak
  vermutet wird (Whop + Micropayment erlauben Secret-Rotation im Dashboard).
- **`*_DISABLE_SIGNATURE=1` ist NUR** für lokale Tests gedacht. In Railway
  niemals setzen.
- Der `/health`-Endpoint zeigt nur **ob** ein Secret gesetzt ist, nie den Wert.

## Schnell-Check

Nach Deploy zeigt `GET /health`:

```json
{
  "ok": true,
  "version": "abc1234",
  "env": "production",
  "dbOk": true,
  "providers": { "digistore": true, "whop": true, "micropayment": true },
  "sendgrid": true,
  "sentry": true
}
```

Wenn ein Provider auf `false` steht, ist das entsprechende Secret im
Railway-Backend-Service nicht gesetzt.
