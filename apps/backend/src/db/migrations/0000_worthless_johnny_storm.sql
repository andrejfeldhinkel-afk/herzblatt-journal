CREATE TABLE "clicks" (
	"id" serial PRIMARY KEY NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"target" text NOT NULL,
	"source" text DEFAULT 'unknown',
	"type" text DEFAULT 'affiliate'
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"ip_hash" text NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"success" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pageviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"path" text NOT NULL,
	"referrer" text DEFAULT 'direct',
	"ua" text
);
--> statement-breakpoint
CREATE TABLE "readers_counter" (
	"id" serial PRIMARY KEY NOT NULL,
	"count" bigint DEFAULT 12847 NOT NULL,
	"last_updated" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text DEFAULT 'unknown'
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_hash" text,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "subscribers" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text DEFAULT 'unknown',
	"ip_hash" text,
	"user_agent" text,
	"unsubscribed_at" timestamp with time zone,
	"sendgrid_id" text,
	CONSTRAINT "subscribers_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE INDEX "clicks_ts_idx" ON "clicks" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "clicks_target_ts_idx" ON "clicks" USING btree ("target","ts");--> statement-breakpoint
CREATE INDEX "clicks_source_ts_idx" ON "clicks" USING btree ("source","ts");--> statement-breakpoint
CREATE INDEX "login_attempts_ip_hash_ts_idx" ON "login_attempts" USING btree ("ip_hash","ts");--> statement-breakpoint
CREATE INDEX "pageviews_ts_idx" ON "pageviews" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "pageviews_path_ts_idx" ON "pageviews" USING btree ("path","ts");--> statement-breakpoint
CREATE INDEX "registrations_created_at_idx" ON "registrations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "registrations_email_idx" ON "registrations" USING btree ("email");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "subscribers_created_at_idx" ON "subscribers" USING btree ("created_at");