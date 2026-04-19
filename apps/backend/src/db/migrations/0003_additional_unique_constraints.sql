-- Additional UNIQUE constraints: registrations.email + inbound_emails.message_id
--
-- Zweck:
--   1. registrations.email UNIQUE — verhindert Duplikat-Signups (Doppel-
--      Submit, mehrfaches Triggern der Route). Phase-5 Finding D2.
--   2. inbound_emails.message_id UNIQUE (partial, NOT NULL) — schließt
--      SendGrid-Retry-Duplikate bei Inbound-Parse. Phase-5 Finding D3.
--
-- Reihenfolge (wichtig!):
--   a. Bestehende Duplikate bereinigen — jeweils die älteste Row (niedrigste
--      id) pro Schlüssel behalten, alle späteren löschen. Semantik: "first
--      insert wins" — der früheste Eintrag ist der echte Signup/die echte
--      eingegangene Email, spätere Duplikate sind Artefakte der Race.
--   b. UNIQUE-Index anlegen. IF NOT EXISTS, damit das Statement auf frischen
--      DBs + bei Re-Runs kein Fehler ist.
--
-- inbound_emails.message_id: partial unique (WHERE message_id IS NOT NULL)
-- weil nicht alle Inbound-Mails ein Message-ID-Header haben (SendGrid gibt
-- bei manchen Test-/Bounce-Mails keinen weiter). Wir wollen NULL-Werte
-- weiter zulassen, aber non-NULL muss unique sein.

DELETE FROM "registrations" a
USING "registrations" b
WHERE a.email = b.email
  AND a.id > b.id;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "registrations_email_unique"
  ON "registrations" ("email");
--> statement-breakpoint
DELETE FROM "inbound_emails" a
USING "inbound_emails" b
WHERE a.message_id IS NOT NULL
  AND b.message_id IS NOT NULL
  AND a.message_id = b.message_id
  AND a.id > b.id;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inbound_emails_message_id_unique"
  ON "inbound_emails" ("message_id")
  WHERE "message_id" IS NOT NULL;
