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
