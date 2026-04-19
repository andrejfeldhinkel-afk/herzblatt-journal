import {
  pgTable,
  serial,
  text,
  timestamp,
  boolean,
  bigint,
  index,
  uniqueIndex,
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
    // UNIQUE auf email — verhindert Duplikat-Signups.
    // Doppelklick auf Submit oder bewusstes Mehrfach-Triggern erzeugte vorher
    // zwei Rows, was die Registrations-KPI aufblähte. Siehe Phase-5 D2.
    emailUnique: uniqueIndex('registrations_email_unique').on(t.email),
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
    // UNIQUE (provider, provider_order_id) — schließt Race-Condition in den
    // Webhook-Handlern (digistore-ipn / micropayment-webhook / whop-webhook).
    // Vorher war das nur ein nicht-uniquer Index; bei parallelen Retries
    // konnten zwei Handler-Instanzen beide den existing-Check passieren und
    // beide INSERTen → Duplikate + doppelte Welcome-Mails. Der Unique-Index
    // zusammen mit `.onConflictDoNothing({ target: [...] })` macht den
    // INSERT atomar idempotent.
    providerOrderUnique: uniqueIndex('purchases_provider_order_unique').on(
      t.provider,
      t.providerOrderId,
    ),
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

/**
 * Inbound-Emails — Mails die an support@herzblatt-journal.de kommen.
 * Via SendGrid Inbound Parse Webhook befüllt.
 *
 * direction='in' = eingehend (vom User)
 * direction='out' = Antwort von uns (in gleichem Thread)
 *
 * threadId verbindet Messages desselben Gesprächs (aus In-Reply-To / References
 * oder subject-matching).
 */
export const inboundEmails = pgTable(
  'inbound_emails',
  {
    id: serial('id').primaryKey(),
    receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
    direction: text('direction').notNull().default('in'), // 'in' | 'out'
    fromEmail: text('from_email').notNull(),
    fromName: text('from_name'),
    toEmail: text('to_email').notNull(),
    subject: text('subject'),
    bodyText: text('body_text'),
    bodyHtml: text('body_html'),
    messageId: text('message_id'),          // RFC 822 Message-ID header
    inReplyTo: text('in_reply_to'),          // Parent Message-ID (für Threading)
    threadId: text('thread_id'),             // Unsere eigene Thread-Grouping
    status: text('status').notNull().default('unread'), // 'unread' | 'read' | 'replied' | 'archived' | 'spam'
    rawPayload: text('raw_payload'),         // Full SendGrid-POST Body für Debug
  },
  (t) => ({
    receivedAtIdx: index('inbound_emails_received_at_idx').on(t.receivedAt),
    statusIdx: index('inbound_emails_status_idx').on(t.status),
    threadIdIdx: index('inbound_emails_thread_id_idx').on(t.threadId),
    fromEmailIdx: index('inbound_emails_from_email_idx').on(t.fromEmail),
    // UNIQUE auf message_id — SendGrid-Retry-Idempotenz.
    // Partial-Unique via Migration (WHERE message_id IS NOT NULL), hier im
    // Schema nur als zusätzlicher Index markiert. Siehe Phase-5 D3.
    messageIdUnique: uniqueIndex('inbound_emails_message_id_unique').on(t.messageId),
  }),
);

/**
 * AdminTodos — einfache Todo-Liste für den Admin.
 * Keine Teilen-Funktion, kein Multi-User — ist nur für den Admin-Workflow.
 */
export const adminTodos = pgTable(
  'admin_todos',
  {
    id: serial('id').primaryKey(),
    text: text('text').notNull(),
    done: boolean('done').notNull().default(false),
    priority: text('priority').notNull().default('normal'), // 'low' | 'normal' | 'high'
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => ({
    doneCreatedIdx: index('admin_todos_done_created_idx').on(t.done, t.createdAt),
  }),
);

/**
 * Products — Universeller Produkt-Katalog für alle Monetarisierungs-Säulen.
 *
 * type unterscheidet die 5 Umsatz-Typen aus MONETIZATION_PLAN.md:
 *   - 'digital'      — eigene E-Books/Kurse (Digistore)
 *   - 'affiliate'    — externe Produkte mit Provision (Amazon/Awin/Tradedoubler/Direct)
 *   - 'service'      — 1:1/Paar-Coaching mit Zeit-Slots
 *   - 'physical'     — Print-on-Demand-Bücher/Merch
 *   - 'subscription' — Premium-Abos (Herzblatt+, VIP)
 *
 * source = das konkrete Netzwerk/die Quelle (frei-text, für Filter + interne Notiz).
 *
 * trackingTarget → wird als clicks.target eingetragen wenn User klickt.
 *                  Format: 'product-<slug>'. So erlauben wir dynamisch neue
 *                  Produkte ohne track-click.ts-Whitelist zu patchen.
 *
 * badges = JSON-Array mit Strings: ["Bestseller", "Empfehlung", "-30%"]
 */
export const products = pgTable(
  'products',
  {
    id: serial('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    shortDescription: text('short_description'),
    longDescription: text('long_description'),
    type: text('type').notNull(), // 'digital' | 'affiliate' | 'service' | 'physical' | 'subscription'
    source: text('source').notNull().default('direct'), // 'digistore' | 'amazon' | 'awin' | 'direct' | 'tradedoubler' | 'coaching' | ...
    category: text('category'), // 'dating-apps' | 'books' | 'coaching' | 'ebooks' | 'apparel' | ...
    priceCents: bigint('price_cents', { mode: 'number' }),
    currency: text('currency').notNull().default('EUR'),
    imageUrl: text('image_url'),
    imageAlt: text('image_alt'),
    targetUrl: text('target_url').notNull(), // finale Affiliate-URL (pre-tagged mit Tracking-Params)
    trackingTarget: text('tracking_target').notNull(), // clicks.target-Wert, z.B. 'product-gottman-card-deck'
    ctaLabel: text('cta_label').notNull().default('Jetzt ansehen'),
    badges: text('badges'), // JSON-Array-String
    rating: text('rating'), // '4.5' als Text (kein float-Präzisionsstress)
    commissionNote: text('commission_note'), // interne Notiz, z.B. 'Amazon 3%, Cookie 24h'
    featured: boolean('featured').notNull().default(false),
    active: boolean('active').notNull().default(true),
    sortOrder: bigint('sort_order', { mode: 'number' }).notNull().default(100),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    slugIdx: index('products_slug_idx').on(t.slug),
    typeActiveIdx: index('products_type_active_idx').on(t.type, t.active),
    categoryIdx: index('products_category_idx').on(t.category),
    featuredIdx: index('products_featured_idx').on(t.featured),
    sortOrderIdx: index('products_sort_order_idx').on(t.sortOrder),
  }),
);

/**
 * Push-Subscriptions — ein Eintrag pro installierter PWA-Instanz.
 * endpoint ist unique (ein Gerät/Browser hat genau eine Subscription).
 * Bei 404/410 beim Broadcast Eintrag als disabled markieren.
 */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: serial('id').primaryKey(),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent'),
    lang: text('lang').default('de-DE'),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
    lastNotificationAt: timestamp('last_notification_at', { withTimezone: true }),
    failureCount: bigint('failure_count', { mode: 'number' }).notNull().default(0),
  },
  (t) => ({
    endpointIdx: index('push_subscriptions_endpoint_idx').on(t.endpoint),
    enabledIdx: index('push_subscriptions_enabled_idx').on(t.enabled),
    createdIdx: index('push_subscriptions_created_idx').on(t.createdAt),
  }),
);

/**
 * Push-Broadcasts — jede versendete Kampagne protokolliert, inkl. Zähler.
 * Wird in /herzraum/push für History + Durchschnitts-Öffnungsrate genutzt.
 */
export const pushBroadcasts = pgTable(
  'push_broadcasts',
  {
    id: serial('id').primaryKey(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    url: text('url').notNull().default('/'),
    icon: text('icon'),
    image: text('image'),
    sentAt: timestamp('sent_at', { withTimezone: true }).defaultNow().notNull(),
    recipientCount: bigint('recipient_count', { mode: 'number' }).notNull().default(0),
    successCount: bigint('success_count', { mode: 'number' }).notNull().default(0),
    failureCount: bigint('failure_count', { mode: 'number' }).notNull().default(0),
    clickCount: bigint('click_count', { mode: 'number' }).notNull().default(0),
    actor: text('actor').notNull().default('admin'),
  },
  (t) => ({
    sentAtIdx: index('push_broadcasts_sent_at_idx').on(t.sentAt),
  }),
);

/**
 * AffiliateLinks — Benannte Short-URLs mit Traffic-Tracking.
 *
 * Zweck: User erstellt Short-URLs wie /go/tiktok-apr-26 und postet sie
 * in Social-Media-Bios. Jeder Klick wird in der clicks-Tabelle geloggt
 * (target='link-<slug>', source=Referrer-Host). So sieht der Admin
 * pro Link wie viele Clicks gesamt, letzte 7d, und woher sie kamen.
 *
 * slug ist unique, wird auch im track-click.ts dynamisch geprüft
 * (analog isProductTarget für products).
 *
 * Zwei Modi:
 *   1. Campaign-Link (targetUrl=NULL): Nutzer landet auf herzblatt-journal.com
 *      mit UTM-Params ?utm_source=<slug>. Für Social-Media-Bios/Posts — du
 *      siehst wie viele Leute über TikTok/Insta/etc. auf deine Seite kommen.
 *   2. Affiliate-Redirect (targetUrl gesetzt): Shortener zu externer URL
 *      (Amazon, Parship etc.). Die Ziel-URL enthält bereits Tracking-Params.
 */
export const affiliateLinks = pgTable(
  'affiliate_links',
  {
    id: serial('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    targetUrl: text('target_url'), // NULL = Campaign-Modus, landet auf /
    campaign: text('campaign'), // optionaler Kampagnen-Tag (z.B. "TikTok-Q2")
    notes: text('notes'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    slugIdx: index('affiliate_links_slug_idx').on(t.slug),
    activeIdx: index('affiliate_links_active_idx').on(t.active),
    campaignIdx: index('affiliate_links_campaign_idx').on(t.campaign),
  }),
);
