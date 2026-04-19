-- Ebook-Drip-Kampagne: scheduled Emails nach Kauf.
--
-- Zweck: Nach erfolgreichem Ebook-Kauf werden drei Drip-Mails geplant:
--   Tag 1  — "Los geht's mit Kapitel 1"
--   Tag 7  — "Wie läufts? Die 3 wichtigsten Erkenntnisse"
--   Tag 30 — "Zeit für den Check-In"
--
-- Der /admin/cron/ebook-drip-Endpoint läuft täglich und sendet alle fälligen
-- Drip-Steps (scheduled_for <= NOW() AND sent_at IS NULL).
--
-- Idempotent: UNIQUE(email, drip_step) verhindert, dass derselbe Step
-- zweimal geplant wird wenn der Webhook mehrfach feuert.

CREATE TABLE IF NOT EXISTS "ebook_drip_schedule" (
  "id" SERIAL PRIMARY KEY,
  "email" TEXT NOT NULL,
  "drip_step" TEXT NOT NULL,
  "scheduled_for" TIMESTAMP WITH TIME ZONE NOT NULL,
  "sent_at" TIMESTAMP WITH TIME ZONE,
  "attempts" INT NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ebook_drip_email_step_unique"
  ON "ebook_drip_schedule" ("email", "drip_step");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ebook_drip_due_idx"
  ON "ebook_drip_schedule" ("scheduled_for")
  WHERE "sent_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ebook_drip_email_idx"
  ON "ebook_drip_schedule" ("email");
