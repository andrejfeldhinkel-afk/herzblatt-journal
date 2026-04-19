import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL ist nicht gesetzt (siehe .env.example)');
}

// Connection-Pool tuning — Railway Postgres Free-Plan erlaubt ~20 conns
// pro Backend-Instanz. Default 10 lässt Raum für Admin-Connections + psql
// + einen zweiten Worker (falls wir skalieren). Env-override für Tuning
// ohne Redeploy.
const poolMax = Number(process.env.DB_POOL_MAX) || 10;
const poolIdleTimeout = Number(process.env.DB_POOL_IDLE_TIMEOUT) || 20; // Sekunden
const poolConnectTimeout = Number(process.env.DB_POOL_CONNECT_TIMEOUT) || 10;

// postgres.js client — connection pooling built-in.
// `queryClient` wird für graceful-shutdown explizit exportiert (siehe index.ts).
export const queryClient = postgres(connectionString, {
  max: poolMax,
  idle_timeout: poolIdleTimeout,
  connect_timeout: poolConnectTimeout,
});

export const db = drizzle(queryClient, { schema });
export { schema };

/**
 * Schließt den DB-Pool sauber (graceful shutdown).
 * `timeout` in Sekunden — laufende Queries bekommen so viel Zeit um fertig zu werden.
 * Danach werden verbleibende Connections hart getrennt.
 */
export async function closeDbPool(timeoutSec = 5): Promise<void> {
  try {
    await queryClient.end({ timeout: timeoutSec });
  } catch {
    /* noop — beim shutdown nicht crashen */
  }
}
