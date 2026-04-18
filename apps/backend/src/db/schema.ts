import {
  pgTable,
  serial,
  text,
  timestamp,
  boolean,
  bigint,
  index,
} from 'drizzle-orm/pg-core';

/**
 * Pageviews — ein Event pro Zeile.
 * Aggregationen (Top Articles, Daily Counts) werden on-the-fly berechnet.
 */
export const pageviews = pgTable(
  'pageviews',
  {
    id: serial('id').primaryKey(),
    ts: timestamp('ts', { withTimezone: true }).defaultNow().notNull(),
    path: text('path').notNull(),
    referrer: text('referrer').default('direct'),
    ua: text('ua'),
  },
  (t) => ({
    tsIdx: index('pageviews_ts_idx').on(t.ts),
    pathTsIdx: index('pageviews_path_ts_idx').on(t.path, t.ts),
  }),
);

/**
 * Clicks — Affiliate-Tracking.
 * target ist gegen Whitelist in der API validiert.
 */
export const clicks = pgTable(
  'clicks',
  {
    id: serial('id').primaryKey(),
    ts: timestamp('ts', { withTimezone: true }).defaultNow().notNull(),
    target: text('target').notNull(),
    source: text('source').default('unknown'),
    type: text('type').default('affiliate'),
  },
  (t) => ({
    tsIdx: index('clicks_ts_idx').on(t.ts),
    targetTsIdx: index('clicks_target_ts_idx').on(t.target, t.ts),
    sourceTsIdx: index('clicks_source_ts_idx').on(t.source, t.ts),
  }),
);

/**
 * Subscribers — Newsletter (ersetzt subscribers.csv).
 * sendgrid_id ist für späteren SendGrid-Sync vorbereitet.
 */
export const subscribers = pgTable(
  'subscribers',
  {
    id: serial('id').primaryKey(),
    email: text('email').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    source: text('source').default('unknown'),
    ipHash: text('ip_hash'),
    userAgent: text('user_agent'),
    unsubscribedAt: timestamp('unsubscribed_at', { withTimezone: true }),
    sendgridId: text('sendgrid_id'),
  },
  (t) => ({
    createdAtIdx: index('subscribers_created_at_idx').on(t.createdAt),
    emailIdx: index('subscribers_email_idx').on(t.email),
  }),
);

/**
 * Registrations — xLoves-Signups, die durchgingen.
 */
export const registrations = pgTable(
  'registrations',
  {
    id: serial('id').primaryKey(),
    email: text('email').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    source: text('source').default('unknown'),
  },
  (t) => ({
    createdAtIdx: index('registrations_created_at_idx').on(t.createdAt),
    emailIdx: index('registrations_email_idx').on(t.email),
  }),
);

/**
 * Sessions — Herzraum-Admin-Sessions.
 * Opaque token → SHA-256-hash in token_hash. 24h TTL.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: serial('id').primaryKey(),
    tokenHash: text('token_hash').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipHash: text('ip_hash'),
  },
  (t) => ({
    expiresAtIdx: index('sessions_expires_at_idx').on(t.expiresAt),
  }),
);

/**
 * LoginAttempts — Rate-Limit für Herzraum-Login.
 * Cleanup >7 Tage optional (low priority).
 */
export const loginAttempts = pgTable(
  'login_attempts',
  {
    id: serial('id').primaryKey(),
    ipHash: text('ip_hash').notNull(),
    ts: timestamp('ts', { withTimezone: true }).defaultNow().notNull(),
    success: boolean('success').notNull(),
  },
  (t) => ({
    ipHashTsIdx: index('login_attempts_ip_hash_ts_idx').on(t.ipHash, t.ts),
  }),
);

/**
 * ReadersCounter — Fake-Counter für Homepage.
 * Einzige Row mit id=1.
 */
export const readersCounter = pgTable('readers_counter', {
  id: serial('id').primaryKey(),
  count: bigint('count', { mode: 'number' }).default(12847).notNull(),
  lastUpdated: timestamp('last_updated', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Purchases — E-Book-Käufe.
 * Provider-agnostisch (Digistore24, Stripe, etc.).
 *
 * rawPayload ist der komplette Webhook-Body (JSON-serialisiert) für
 * spätere Debug-/Support-Zwecke.
 */
export const purchases = pgTable(
  'purchases',
  {
    id: serial('id').primaryKey(),
    provider: text('provider').notNull(), // 'digistore24' | 'stripe' | 'manual'
    providerOrderId: text('provider_order_id').notNull(), // unique pro provider
    email: text('email').notNull(),
    product: text('product').notNull(), // 'ebook' etc
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    currency: text('currency').default('EUR').notNull(),
    status: text('status').default('paid').notNull(), // 'paid', 'refunded', 'chargeback'
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    rawPayload: text('raw_payload'),
  },
  (t) => ({
    createdAtIdx: index('purchases_created_at_idx').on(t.createdAt),
    emailIdx: index('purchases_email_idx').on(t.email),
    providerOrderIdx: index('purchases_provider_order_idx').on(t.provider, t.providerOrderId),
  }),
);

/**
 * Audit-Log — alle schreibenden Admin-Actions.
 * 'actor' = aus Session abgeleitet (wir haben nur 1 Admin, daher
 * entweder 'admin' oder 'system'). 'meta' kann JSON sein mit zusätzlichen
 * Detail-Infos (z.B. slug, commit-sha, vorher/nachher-diff-summary).
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: serial('id').primaryKey(),
    ts: timestamp('ts', { withTimezone: true }).defaultNow().notNull(),
    actor: text('actor').notNull().default('admin'),
    action: text('action').notNull(), // 'article.create', 'article.update', 'author.update', 'gdpr.delete', etc.
    target: text('target'),            // slug, email, or identifier
    ipHash: text('ip_hash'),
    meta: text('meta'),                // JSON-string (optional)
  },
  (t) => ({
    tsIdx: index('audit_log_ts_idx').on(t.ts),
    actionIdx: index('audit_log_action_idx').on(t.action),
  }),
);
