# Payment-Provider-Management im Herzraum-Admin

**Datum:** 2026-04-27
**Status:** Approved (Design)
**Repo:** `andrejfeldhinkel-afk/herzblatt-journal` (Monorepo) — Implementation needs fresh clone, NOT this flat local repo

## Ziel

Aktuell sind alle Payment-Credentials Hardcoded in Railway-Env-Vars
(`WHOP_API_KEY`, `MICROPAYMENT_ACCESS_KEY`, etc.). Der User soll im
`/herzraum`-Admin selbst:

- Methoden ein-/ausschalten (live/test)
- API-Keys, Plan-IDs, Webhook-Secrets eingeben/ändern
- Verbindung pro Methode testen
- Reihenfolge & Beschriftung im `/ebook`-Checkout-Grid steuern

Ohne Code-Deploy oder Railway-Dashboard-Login.

## Scope

**In scope:**
- 3 existierende Methoden: `whop`, `micropayment-sofort`, `micropayment-paysafecard`
- Pro-Methode-Toggle (B aus Brainstorming)
- AES-256-GCM-Encryption für Secrets
- Migration aus existierenden Env-Vars (Backward-Compat)
- Admin-UI: neue Page `/herzraum/payments`
- Backend-Routes für CRUD + Test-Verbindung
- Audit-Log-Integration

**Out of scope:**
- Neue Provider hinzufügen (Stripe, PayPal direkt, etc.) — UI ist auf 3 Methoden begrenzt
- Whop-Plan-Preis ändern (steckt im Whop-Plan, nicht in unserer DB)
- A/B-Testing von Checkout-Flows
- Refund-/Chargeback-Aktionen aus dem Admin

## Architektur

### Datenmodell

Neue Tabelle `payment_methods` (PostgreSQL, via Drizzle):

```sql
CREATE TABLE payment_methods (
  slug              TEXT PRIMARY KEY,           -- 'whop' | 'micropayment-sofort' | 'micropayment-paysafecard'
  provider          TEXT NOT NULL,              -- 'whop' | 'micropayment'
  display_name      TEXT NOT NULL,              -- 'Kreditkarte' | 'Sofort' | 'paysafecard'
  enabled           BOOLEAN NOT NULL DEFAULT false,
  test_mode         BOOLEAN NOT NULL DEFAULT true,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  public_config     JSONB NOT NULL DEFAULT '{}',  -- { planId, projectKey, priceEuroCent, checkoutUrl }
  encrypted_secrets TEXT,                          -- AES-256-GCM payload base64 (nullable wenn neu)
  last_test_at      TIMESTAMPTZ,
  last_test_status  TEXT,                          -- 'ok' | 'fail' | NULL
  last_test_error   TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by        TEXT                           -- Admin-User aus Session
);
```

Konkrete Initial-Rows (im Seed):

| slug | provider | display_name | public_config |
|---|---|---|---|
| `whop` | whop | Kreditkarte | `{ planId, checkoutUrl }` |
| `micropayment-sofort` | micropayment | Sofort | `{ projectKey, priceEuroCent: 8999 }` |
| `micropayment-paysafecard` | micropayment | paysafecard | `{ projectKey, priceEuroCent: 8999 }` |

Whop teilt `apiKey` + `webhookSecret` über beide ggf. zukünftigen Whop-Methoden — wir
speichern aber pro Methoden-Row redundant, weil das Schema sonst inkonsistent wird mit
Micropayment (separater `accessKey` aber shared `projectKey`). Pragmatischer Ansatz:
gleiche `provider`-Werte → gleiche Secrets übers UI auch.

### Encryption

- **Algorithmus:** AES-256-GCM
- **Key:** `PAYMENTS_MASTER_KEY` env var, 32 Bytes hex (64 Zeichen). Beim
  Backend-Start fail-closed wenn ungültig oder fehlt.
- **Format:** `base64(iv || authTag || ciphertext)` als ein String in
  `encrypted_secrets`
- **Plaintext-Format:** JSON, schema je nach Provider:
  - whop: `{ apiKey, webhookSecret }`
  - micropayment: `{ accessKey }` (Webhook nutzt den gleichen Key per md5-sig)
- **Helper:** `apps/backend/src/lib/payments-crypto.ts` mit
  `encryptSecrets(plain: object): string` und `decryptSecrets(blob: string): object`
- **Key-Rotation:** Out of scope (manueller Re-Encrypt-Script bei Bedarf)

### Backend-Routes (Hono, mounted unter `/herzraum/payments`)

| Route | Methode | Zweck |
|---|---|---|
| `/herzraum/payments` | GET | List aller 3 Methoden, Secrets gemaskt (`apiKey: "****wxyz"`) |
| `/herzraum/payments/:slug` | PATCH | Update — body kann enthalten: `enabled`, `test_mode`, `sort_order`, `public_config`, `secrets` (plain in JSON, wird encrypted) |
| `/herzraum/payments/:slug/test` | POST | Triggert Provider-Verifikation, schreibt `last_test_*` Felder, returned Status |

Alle 3 Routes: Session-Auth-Required, schreibt Audit-Log-Entry mit Diff
(maskierte Secrets im Diff).

### Provider-Verifikation (`POST .../test`)

- **whop**: `GET https://api.whop.com/api/v5/me` mit Bearer = apiKey. 200 = ok.
- **micropayment**: Berechnet Test-URL für Bezahlfenster mit `priceEuroCent=1`,
  ohne tatsächlichen Aufruf — Signatur-Validität (md5-Konsistenz) ist die
  Verifikation. Fehler nur wenn `accessKey` fehlt.

### Migration: Env-Var-Seed

`apps/backend/src/db/migrations.ts` → `runStartupMigrations()` erweitern:

```ts
async function seedPaymentMethodsIfEmpty() {
  const count = await db.select().from(paymentMethods).limit(1);
  if (count.length > 0) return;

  const seeds = [
    {
      slug: 'whop',
      provider: 'whop',
      display_name: 'Kreditkarte',
      enabled: !!process.env.WHOP_API_KEY,
      test_mode: false,
      sort_order: 1,
      public_config: {
        planId: process.env.WHOP_PLAN_ID_EBOOK ?? '',
        checkoutUrl: 'https://whop.com/checkout/',
      },
      encrypted_secrets: encryptSecrets({
        apiKey: process.env.WHOP_API_KEY ?? '',
        webhookSecret: process.env.WHOP_WEBHOOK_SECRET ?? '',
      }),
    },
    // ... micropayment-sofort, micropayment-paysafecard analog
  ];

  await db.insert(paymentMethods).values(seeds);
}
```

Nach Initial-Seed ist DB Source-of-Truth. Env-Vars werden **nicht mehr gelesen**
zur Laufzeit (außer `PAYMENTS_MASTER_KEY`).

### Auswirkung auf bestehenden Code

| Datei (geschätzt) | Änderung |
|---|---|
| `apps/backend/src/routes/checkout-micropayment.ts` | Liest `accessKey`, `projectKey`, `priceEuroCent`, `test_mode` aus DB statt env |
| `apps/backend/src/routes/whop-webhook.ts` | Liest `webhookSecret` aus DB |
| `apps/backend/src/routes/micropayment-webhook.ts` | Liest `accessKey` aus DB |
| `apps/frontend/src/pages/ebook.astro` | Fetcht enabled methods sortiert via `/api/payments/public` (neuer Endpoint, nur enabled+display_name+slug+sort_order) und rendert dynamisch das 3-Card-Grid |
| `apps/frontend/src/pages/herzraum/payments.astro` | **NEU** — Admin-UI |
| `apps/backend/src/routes/herzraum/payments.ts` | **NEU** — Admin-API |
| `apps/backend/src/lib/payments-crypto.ts` | **NEU** — Encryption-Helper |
| `apps/backend/src/db/schema.ts` | **NEU** — `paymentMethods`-Table |

### Cache & Live-Update

`/api/payments/public` (gibt enabled+display_name+sort_order für Frontend) hat
60s in-memory cache im Backend, wird beim PATCH invalidiert. So wirkt
Admin-Toggle in <60s live ohne Backend-Restart.

## Frontend `/herzraum/payments`

### Layout

```
/herzraum/payments
├── Header: "Zahlungsmethoden" + Hilfe-Tooltip
├── Warning-Banner (rot) wenn PAYMENTS_MASTER_KEY nicht gesetzt
├── 3 Cards (eine pro Methode):
│   ├── Header: Methoden-Name + Provider-Logo + Status-Badge (live/aus/test)
│   ├── Toggle "Aktiv" + "Test-Modus"
│   ├── Public-Config (sichtbar)
│   │   ├── Plan-ID (whop) ODER Project-Key + Eurocent (micropayment)
│   │   └── Sort-Order
│   ├── Secrets (maskiert):
│   │   └── "API-Key: ****wxyz [Bearbeiten]"
│   ├── Footer:
│   │   ├── "Verbindung testen" Button → Badge mit Ergebnis
│   │   ├── "Speichern" Button (per Card, kein global save)
│   │   └── "Zuletzt geändert: 2026-04-27 14:23 von andrej"
```

### UI-Verhalten

- "Bearbeiten" auf Secret-Feld → ersetzt Maske mit Input, "Speichern" sendet
  PATCH mit neuem Wert. Leerer Input = kein Update.
- Toggle "Aktiv" speichert sofort (optimistic UI, rollback bei Fehler)
- "Verbindung testen" zeigt Spinner, dann grünen/roten Badge mit Fehler-Detail

## Audit-Log

Jede schreibende Operation (PATCH, Toggle) schreibt in `audit_log`:

```json
{
  "actor": "andrej",
  "action": "payment_method.update",
  "target": "whop",
  "diff": { "enabled": [false, true], "secrets.apiKey": ["****abcd", "****wxyz"] },
  "ts": "..."
}
```

Secrets werden im Diff IMMER maskiert (kein Plain-Wert ins audit_log).

## Sicherheits-Überlegungen

1. **Secret-Leak via API-Response:** Niemals plain secrets in GET-Response. Alle
   Strings >4 Zeichen werden auf `****<last4>` reduziert.
2. **CSRF:** Schreibende Endpoints nutzen die existierenden Session-CSRF-Tokens
   (siehe ADMIN_AUDIT.md).
3. **Master-Key-Verlust:** Wenn `PAYMENTS_MASTER_KEY` rotiert/verloren wird, sind
   alle DB-Secrets unleserlich → Admin muss neu eingeben. UI zeigt klaren
   Fehler-State ("Secret kann nicht entschlüsselt werden — bitte neu setzen").
4. **Brute-Force-Test:** `/test`-Endpoint rate-limited auf 10 Requests/Min/Methode.

## Risiken & Migration-Path

- **Risiko:** Erstmaliger Deploy ohne `PAYMENTS_MASTER_KEY` → Backend startet
  nicht. Mitigation: Klarer Fehler beim Start, Doku im PR.
- **Risiko:** Seed läuft nur einmal — wenn Whop-Key in env nach Seed rotiert,
  greift's nicht mehr. Mitigation: Nach Deploy einmal über UI verifizieren und
  den env-var aus Railway entfernen → keine Verwirrung welche Source aktiv ist.
- **Rollback:** Wenn Feature-Flag `PAYMENTS_DB_ENABLED=0` (env), fällt das
  Backend zurück auf env-vars (nur in Iteration 1 als Sicherheitsnetz).

## Workflow

Per Memory `project_repo_structure.md`:

1. Fresh Clone: `git clone git@github.com:andrejfeldhinkel-afk/herzblatt-journal.git /tmp/herzblatt-payments-admin`
2. Branch: `feat/payments-admin`
3. Implementierung gemäß Plan (next: writing-plans skill)
4. PR + Railway-Deploy via API
5. Manuell verifizieren: Master-Key setzen, Seed läuft, alle 3 Methoden testen
6. Env-Vars aus Railway entfernen (außer `PAYMENTS_MASTER_KEY`)
