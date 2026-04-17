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
