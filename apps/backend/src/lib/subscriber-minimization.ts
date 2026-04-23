/**
 * Subscriber-Datenminimierung — DSGVO Art. 5 Abs. 1 lit. c (Datenminimierung)
 * und Art. 17 (Recht auf Löschung).
 *
 * Wer sich vom Newsletter abgemeldet hat, hat explizit einem Datenbehalt
 * widersprochen. Nach 6 Monaten Retention-Fenster löschen wir den Row
 * hart aus der subscribers-Tabelle.
 *
 * Warum 6 Monate und nicht sofort?
 *   - Re-Subscribe-Fenster: manche User unsubscriben aus Versehen (oder
 *     weil sie gerade genervt sind) und re-subscriben später. Die
 *     ursprünglichen Metadaten (source, createdAt) helfen dem Tracking.
 *   - Audit-Trail: falls jemand später behauptet "ich war nie abgemeldet",
 *     haben wir den Eintrag + unsubscribed_at noch ein halbes Jahr.
 *
 * Nach 6 Monaten ist der Nutzen vorbei, die Zweckbindung endet →
 * physisch löschen.
 *
 * Läuft als Cron (1× täglich). Kein eager-delete, damit wir sehen wie viele
 * betroffen sind bevor wir es produktiv schalten.
 */
import { and, lt, isNotNull } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { logAuditRaw } from './audit.js';

const RETENTION_MS = 6 * 30 * 24 * 60 * 60 * 1000; // ~6 Monate (konservativ 30d/month)
const INTERVAL_MS = 24 * 60 * 60 * 1000; // 1× täglich
let timer: NodeJS.Timeout | null = null;

async function runMinimization(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - RETENTION_MS);
    const deleted = await db
      .delete(schema.subscribers)
      .where(
        and(
          isNotNull(schema.subscribers.unsubscribedAt),
          lt(schema.subscribers.unsubscribedAt, cutoff),
        ),
      )
      .returning({ id: schema.subscribers.id });

    if (deleted.length > 0) {
      console.log(`[subscriber-minimization] removed ${deleted.length} subscribers unsubscribed before ${cutoff.toISOString()}`);
      await logAuditRaw({
        action: 'gdpr.subscriber-minimization',
        actor: 'cron',
        meta: {
          deleted: deleted.length,
          cutoff: cutoff.toISOString(),
          retention_days: Math.floor(RETENTION_MS / 86_400_000),
        },
      });
    }
  } catch (err) {
    console.error('[subscriber-minimization] failed:', err);
  }
}

export function startSubscriberMinimization(): void {
  if (timer) return;
  // Ersten Run 5 Min nach Boot — nicht sofort, damit ein Deploy-Fail
  // ohne DB-Access nicht direkt einen Run triggert.
  setTimeout(() => { void runMinimization(); }, 5 * 60 * 1000);
  timer = setInterval(() => void runMinimization(), INTERVAL_MS);
  console.log(`[subscriber-minimization] started (interval=24h, retention=6 months)`);
}

export function stopSubscriberMinimization(): void {
  if (timer) { clearInterval(timer); timer = null; }
}
