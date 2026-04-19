/**
 * Runtime-Migrations: werden beim Backend-Start ausgeführt.
 *
 * Verwendet CREATE TABLE/INDEX IF NOT EXISTS — strikt idempotent.
 * Safer-Ansatz als drizzle-kit push (das Schema DIFFS fahren würde).
 *
 * Neue Tabellen HIER eintragen bis wir ein richtiges Migrations-System haben.
 * Bei bestehenden Tabellen darf hier NICHTS geändert werden (kein ALTER TABLE
 * ohne Review) — sonst Risiko von Daten-Verlust.
 */
import { sql } from 'drizzle-orm';
import { db } from './index.js';

export async function runStartupMigrations(): Promise<void> {
  const start = Date.now();
  console.log('[migrate] starting runtime migrations...');

  try {
    // purchases — E-Book-Käufe
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS purchases (
        id SERIAL PRIMARY KEY,
        provider TEXT NOT NULL,
        provider_order_id TEXT NOT NULL,
        email TEXT NOT NULL,
        product TEXT NOT NULL,
        amount_cents BIGINT NOT NULL,
        currency TEXT NOT NULL DEFAULT 'EUR',
        status TEXT NOT NULL DEFAULT 'paid',
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        raw_payload TEXT
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS purchases_created_at_idx ON purchases(created_at)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS purchases_email_idx ON purchases(email)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS purchases_provider_order_idx ON purchases(provider, provider_order_id)
    `);

    // UNIQUE-Index auf (provider, provider_order_id) — verhindert
    // Duplicate-Inserts bei parallelen Webhook-Retries (race condition
    // im alten check-then-insert-Muster, siehe F1 aus Phase-4-Audit).
    //
    // Reihenfolge ist wichtig:
    //   1. Duplikate de-dupen (behält jeweils die älteste Row pro
    //      (provider, provider_order_id) — niedrigste id).
    //   2. Unique-Index anlegen (IF NOT EXISTS, strikt idempotent).
    //
    // Beide Statements nutzen idempotente Varianten — wiederholbar auf
    // jedem Startup, selbst wenn der Index bereits existiert.
    await db.execute(sql`
      DELETE FROM purchases a
      USING purchases b
      WHERE a.provider = b.provider
        AND a.provider_order_id = b.provider_order_id
        AND a.id > b.id
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS purchases_provider_order_unique
        ON purchases(provider, provider_order_id)
    `);

    // audit_log — Admin-Actions-Journal
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS audit_log (
        id SERIAL PRIMARY KEY,
        ts TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        actor TEXT NOT NULL DEFAULT 'admin',
        action TEXT NOT NULL,
        target TEXT,
        ip_hash TEXT,
        meta TEXT
      )
    `);

    // inbound_emails — Inbox für admin
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS inbound_emails (
        id SERIAL PRIMARY KEY,
        received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        direction TEXT NOT NULL DEFAULT 'in',
        from_email TEXT NOT NULL,
        from_name TEXT,
        to_email TEXT NOT NULL,
        subject TEXT,
        body_text TEXT,
        body_html TEXT,
        message_id TEXT,
        in_reply_to TEXT,
        thread_id TEXT,
        status TEXT NOT NULL DEFAULT 'unread',
        raw_payload TEXT
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS inbound_emails_received_at_idx ON inbound_emails(received_at DESC)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS inbound_emails_status_idx ON inbound_emails(status)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS inbound_emails_thread_id_idx ON inbound_emails(thread_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS inbound_emails_from_email_idx ON inbound_emails(from_email)`);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS audit_log_ts_idx ON audit_log(ts)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS audit_log_action_idx ON audit_log(action)
    `);

    // Readers-Counter: stellt sicher, dass Row id=1 existiert
    await db.execute(sql`
      INSERT INTO readers_counter (id, count, last_updated)
      VALUES (1, 12847, NOW())
      ON CONFLICT (id) DO NOTHING
    `);

    // admin_todos — Einfache Todo-Liste für Admin
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS admin_todos (
        id SERIAL PRIMARY KEY,
        text TEXT NOT NULL,
        done BOOLEAN NOT NULL DEFAULT FALSE,
        priority TEXT NOT NULL DEFAULT 'normal',
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMP WITH TIME ZONE
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS admin_todos_done_created_idx ON admin_todos(done, created_at DESC)`);

    // products — Universeller Produkt-Katalog (alle 5 Monetarisierungs-Säulen)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        short_description TEXT,
        long_description TEXT,
        type TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'direct',
        category TEXT,
        price_cents BIGINT,
        currency TEXT NOT NULL DEFAULT 'EUR',
        image_url TEXT,
        image_alt TEXT,
        target_url TEXT NOT NULL,
        tracking_target TEXT NOT NULL,
        cta_label TEXT NOT NULL DEFAULT 'Jetzt ansehen',
        badges TEXT,
        rating TEXT,
        commission_note TEXT,
        featured BOOLEAN NOT NULL DEFAULT FALSE,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order BIGINT NOT NULL DEFAULT 100,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS products_slug_idx ON products(slug)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS products_type_active_idx ON products(type, active)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS products_category_idx ON products(category)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS products_featured_idx ON products(featured)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS products_sort_order_idx ON products(sort_order)`);

    // push_subscriptions — PWA-Push-Abonnenten
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id SERIAL PRIMARY KEY,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        user_agent TEXT,
        lang TEXT DEFAULT 'de-DE',
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        last_notification_at TIMESTAMP WITH TIME ZONE,
        failure_count BIGINT NOT NULL DEFAULT 0
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS push_subscriptions_endpoint_idx ON push_subscriptions(endpoint)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS push_subscriptions_enabled_idx ON push_subscriptions(enabled)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS push_subscriptions_created_idx ON push_subscriptions(created_at)`);

    // push_broadcasts — Kampagnen-History
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS push_broadcasts (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        url TEXT NOT NULL DEFAULT '/',
        icon TEXT,
        image TEXT,
        sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        recipient_count BIGINT NOT NULL DEFAULT 0,
        success_count BIGINT NOT NULL DEFAULT 0,
        failure_count BIGINT NOT NULL DEFAULT 0,
        click_count BIGINT NOT NULL DEFAULT 0,
        actor TEXT NOT NULL DEFAULT 'admin'
      )
    `);
    // Additive migration for existing installs (click_count added later) —
    // ADD COLUMN IF NOT EXISTS is safe on re-run and on a freshly created table.
    await db.execute(sql`ALTER TABLE push_broadcasts ADD COLUMN IF NOT EXISTS click_count BIGINT NOT NULL DEFAULT 0`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS push_broadcasts_sent_at_idx ON push_broadcasts(sent_at)`);

    // affiliate_links — Benannte Short-URLs mit Traffic-Tracking
    // Klicks werden in clicks-Tabelle mit target='link-<slug>' geloggt
    // target_url darf NULL sein (Campaign-Modus → User landet auf /)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS affiliate_links (
        id SERIAL PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        target_url TEXT,
        campaign TEXT,
        notes TEXT,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);
    // Migration für bestehende DB: NOT NULL-Constraint auf target_url entfernen.
    // DROP NOT NULL ist idempotent — ALTER auf bereits nullable column ist no-op.
    await db.execute(sql`ALTER TABLE affiliate_links ALTER COLUMN target_url DROP NOT NULL`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS affiliate_links_slug_idx ON affiliate_links(slug)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS affiliate_links_active_idx ON affiliate_links(active)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS affiliate_links_campaign_idx ON affiliate_links(campaign)`);

    // UNIQUE-Constraint auf registrations.email — verhindert Duplikat-Signups.
    // De-dupe vorher (älteste Row pro email behalten), dann Unique-Index bauen.
    // Siehe migrations/0003_additional_unique_constraints.sql + Phase-5 D2.
    await db.execute(sql`
      DELETE FROM registrations a
      USING registrations b
      WHERE a.email = b.email
        AND a.id > b.id
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS registrations_email_unique
        ON registrations(email)
    `);

    // UNIQUE-Constraint auf inbound_emails.message_id (partial, WHERE not
    // null) — SendGrid-Retry-Idempotenz. Phase-5 D3.
    await db.execute(sql`
      DELETE FROM inbound_emails a
      USING inbound_emails b
      WHERE a.message_id IS NOT NULL
        AND b.message_id IS NOT NULL
        AND a.message_id = b.message_id
        AND a.id > b.id
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS inbound_emails_message_id_unique
        ON inbound_emails(message_id)
        WHERE message_id IS NOT NULL
    `);

    console.log(`[migrate] done in ${Date.now() - start}ms`);
  } catch (err) {
    console.error('[migrate] FAILED:', err);
    // Kein throw — Backend soll trotzdem starten, auch wenn Migration fails
    // (z.B. bei Lesekonflikt — Tabelle existiert schon parallel).
  }
}
