-- Newsletter-Broadcasts: Admin kann Artikel/News als Mail an alle Subscriber schicken.
--
-- Zweck: Der Admin schreibt einen Artikel (oder freie Mail) und sendet ihn per
-- SendGrid an alle aktiven Subscribers (unsubscribed_at IS NULL).
--
-- Ablauf:
--   1. Admin erstellt Draft (POST /herzraum/newsletter-broadcast)
--   2. Optional: Testsend an einzelne Adresse (POST /herzraum/newsletter-broadcast/:id/test)
--   3. Sendezeit: POST /herzraum/newsletter-broadcast/:id/send
--      → status transitioniert draft → sending → sent|failed
--      → recipient_count + success_count werden beim Abschluss geschrieben
--   4. Drafts können gelöscht werden (DELETE), einmal versendet nicht mehr.
--
-- article_slug ist optional — wenn das Broadcast aus einem Artikel generiert
-- wurde, zeigt die UI den Link auf den Artikel. Keine FK, damit auch
-- Artikel-Löschungen die History nicht brechen.

CREATE TABLE IF NOT EXISTS "newsletter_broadcasts" (
  "id" SERIAL PRIMARY KEY,
  "subject" TEXT NOT NULL,
  "article_slug" TEXT,
  "body_html" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "sent_at" TIMESTAMP WITH TIME ZONE,
  "recipient_count" INTEGER,
  "success_count" INTEGER,
  "created_by" TEXT NOT NULL DEFAULT 'admin',
  "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "newsletter_broadcasts_created_at_idx"
  ON "newsletter_broadcasts" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "newsletter_broadcasts_status_idx"
  ON "newsletter_broadcasts" ("status");
