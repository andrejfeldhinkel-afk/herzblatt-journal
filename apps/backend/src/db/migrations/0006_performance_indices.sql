-- Performance-Indices (Reliability-Pass)
--
-- Diese Indices fehlten und trafen in heißen Queries Sequential-Scans.
-- Alle Statements sind idempotent (IF NOT EXISTS) → sicher wiederholbar.
--
-- 1) audit_log(target) — GDPR-Suche nach Email in target (admin/gdpr.ts).
-- 2) products(tracking_target) — track-click.ts lookup pro Affiliate-Klick.
-- 3) clicks(target, ts DESC) — Stats-Queries lesen DESC.
-- 4) pageviews(path, ts DESC) — Top-Pages analog.

CREATE INDEX IF NOT EXISTS "audit_log_target_idx"
  ON "audit_log" ("target")
  WHERE "target" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_tracking_target_idx"
  ON "products" ("tracking_target");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clicks_target_ts_desc_idx"
  ON "clicks" ("target", "ts" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pageviews_path_ts_desc_idx"
  ON "pageviews" ("path", "ts" DESC);
