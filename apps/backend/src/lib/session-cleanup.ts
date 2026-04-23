/**
 * Session-Cleanup-Cron.
 *
 * Vorher: `DELETE FROM sessions WHERE expires_at < NOW()` in verifySession()
 * — also bei JEDEM authentifizierten Request. Auf einer aktiven Admin-Page
 * mit Polling waren das 10+ unnötige Full-Table-Scans pro Minute.
 *
 * Jetzt: 1× alle 10 Min als periodischer Cleanup. Abgelaufene Sessions werden
 * ohnehin durch die WHERE-Klausel in verifySession gefiltert — das eager-DELETE
 * war nur kosmetisch (Tabelle kleinhalten), nicht korrektheitsrelevant.
 */
import { lt } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

const INTERVAL_MS = 10 * 60 * 1000; // 10 min
let timer: NodeJS.Timeout | null = null;

async function runCleanup(): Promise<void> {
  try {
    const deleted = await db
      .delete(schema.sessions)
      .where(lt(schema.sessions.expiresAt, new Date()))
      .returning({ id: schema.sessions.id });
    if (deleted.length > 0) {
      console.log(`[session-cleanup] removed ${deleted.length} expired sessions`);
    }
  } catch (err) {
    console.error('[session-cleanup] failed:', err);
  }
}

export function startSessionCleanup(): void {
  if (timer) return;
  // Erste Run direkt nach Boot — wenn der Prozess vor längerem crashte und
  // Sessions in der DB schimmeln.
  void runCleanup();
  timer = setInterval(() => void runCleanup(), INTERVAL_MS);
  console.log(`[session-cleanup] started (interval=${INTERVAL_MS / 60_000}min)`);
}

export function stopSessionCleanup(): void {
  if (timer) { clearInterval(timer); timer = null; }
}
