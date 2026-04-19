-- UNIQUE-Index auf purchases(provider, provider_order_id).
--
-- Zweck: schließt die Race-Condition in den drei Webhook-Handlern
-- (digistore-ipn, micropayment-webhook, whop-webhook) die alle das
-- check-then-insert-Muster nutzen. Ohne UNIQUE-Index konnten parallele
-- Retries doppelte Rows + doppelte Welcome-Mails erzeugen.
--
-- F1 aus Phase-4-Backend-Audit (2026-04-19).
--
-- Reihenfolge:
--   1. Bestehende Duplikate de-dupen — behalten die älteste Row pro
--      (provider, provider_order_id), löschen alle jüngeren. Das ist die
--      korrekte Semantik weil der älteste Eintrag der echte "first win"
--      des race-Lossaufs war.
--   2. Unique-Index anlegen (IF NOT EXISTS, damit das Statement auch auf
--      frischen DBs und bei re-runs keinen Fehler wirft).
--
-- Diese Migration ist zusätzlich in src/db/migrate.ts idempotent
-- dupliziert, damit Railway-Startup sie automatisch fährt, auch wenn
-- drizzle-kit push nicht manuell ausgeführt wurde.

DELETE FROM "purchases" a
USING "purchases" b
WHERE a.provider = b.provider
  AND a.provider_order_id = b.provider_order_id
  AND a.id > b.id;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "purchases_provider_order_unique"
  ON "purchases" ("provider", "provider_order_id");
