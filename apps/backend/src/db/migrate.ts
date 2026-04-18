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

    console.log(`[migrate] done in ${Date.now() - start}ms`);
  } catch (err) {
    console.error('[migrate] FAILED:', err);
    // Kein throw — Backend soll trotzdem starten, auch wenn Migration fails
    // (z.B. bei Lesekonflikt — Tabelle existiert schon parallel).
  }
}
