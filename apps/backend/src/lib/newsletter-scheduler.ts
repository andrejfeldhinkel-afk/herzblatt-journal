/**
 * Newsletter-Broadcast-Scheduler.
 *
 * Läuft als setInterval im Backend-Prozess (alle 60 s). Scannt
 * `newsletter_broadcasts WHERE status='scheduled' AND scheduled_for <= NOW()`
 * und startet jede fällige Sendung atomar (status='sending' claim).
 *
 * Ohne Redis/Queue: State in Postgres, atomar über
 * UPDATE … WHERE status='scheduled' AND id=… RETURNING * — mehrere
 * Backend-Instanzen könnten konkurrierend claimen; die erste bekommt die
 * Row, alle anderen 0 rows.
 *
 * Limits:
 *   - Single-instance Railway-Deploy: atomarer claim ist fein.
 *   - Bei Multi-Instance: Postgres-Row-Lock macht es trotzdem safe.
 *   - Fällige Broadcasts werden seriell gesendet (nicht parallel), um
 *     Rate-Limits bei SendGrid nicht zu triggern.
 */
import { and, eq, lte, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { isNull } from 'drizzle-orm';
import { sendBroadcastEmail, isSendGridEnabled } from './sendgrid.js';
import { logAuditRaw } from './audit.js';

const POLL_INTERVAL_MS = 60 * 1000; // 1 min

let timer: NodeJS.Timeout | null = null;
let running = false;

async function processDue(): Promise<void> {
  if (running) return; // Skippe Overlap, falls sendet länger als Interval dauert
  running = true;
  try {
    // Alle fälligen scheduled-broadcasts (status='scheduled' AND scheduled_for <= NOW())
    const due = await db
      .select()
      .from(schema.newsletterBroadcasts)
      .where(
        and(
          eq(schema.newsletterBroadcasts.status, 'scheduled'),
          lte(schema.newsletterBroadcasts.scheduledFor, new Date()),
        ),
      );

    if (!due.length) return;

    if (!isSendGridEnabled()) {
      console.warn('[scheduler] SendGrid disabled — kann scheduled broadcasts nicht senden');
      return;
    }

    // Seriell, damit SendGrid nicht rate-limited
    for (const row of due) {
      // Atomar claimen: von 'scheduled' → 'sending'. Nur genau eine
      // Instanz gewinnt den Claim.
      const [claimed] = await db
        .update(schema.newsletterBroadcasts)
        .set({ status: 'sending' })
        .where(
          and(
            eq(schema.newsletterBroadcasts.id, row.id),
            eq(schema.newsletterBroadcasts.status, 'scheduled'),
          ),
        )
        .returning();

      if (!claimed) continue; // jemand anders war schneller

      // Empfänger holen
      const subsRows = await db
        .select({ email: schema.subscribers.email })
        .from(schema.subscribers)
        .where(isNull(schema.subscribers.unsubscribedAt));
      const recipients = subsRows.map((r) => r.email.toLowerCase().trim()).filter(Boolean);

      try {
        const result = await sendBroadcastEmail(claimed.subject, claimed.bodyHtml, recipients);
        await db
          .update(schema.newsletterBroadcasts)
          .set({
            status: 'sent',
            sentAt: new Date(),
            recipientCount: recipients.length,
            successCount: result.sent,
          })
          .where(eq(schema.newsletterBroadcasts.id, claimed.id));

        await logAuditRaw({
          action: 'newsletter.broadcast.send-scheduled',
          target: String(claimed.id),
          actor: 'scheduler',
          meta: {
            subject: claimed.subject.slice(0, 120),
            scheduledFor: claimed.scheduledFor?.toISOString(),
            recipients: recipients.length,
            sent: result.sent,
            failed: result.failed,
          },
        });
        console.log(`[scheduler] sent broadcast ${claimed.id}: ${result.sent}/${recipients.length}`);
      } catch (err) {
        console.error(`[scheduler] send failed for broadcast ${claimed.id}:`, err);
        await db
          .update(schema.newsletterBroadcasts)
          .set({ status: 'failed', recipientCount: recipients.length, successCount: 0 })
          .where(eq(schema.newsletterBroadcasts.id, claimed.id));
        await logAuditRaw({
          action: 'newsletter.broadcast.send-scheduled-failed',
          target: String(claimed.id),
          actor: 'scheduler',
          meta: { error: String(err).slice(0, 400) },
        });
      }
    }
  } catch (err) {
    console.error('[scheduler] unexpected error:', err);
  } finally {
    running = false;
  }
}

export function startNewsletterScheduler(): void {
  if (timer) return;
  // Ein erster Durchgang direkt nach Boot (falls der Backend-Neustart
  // während eines Sendefensters passierte).
  void processDue();
  timer = setInterval(() => void processDue(), POLL_INTERVAL_MS);
  console.log(`[scheduler] newsletter-broadcast-scheduler started (poll=${POLL_INTERVAL_MS / 1000}s)`);
}

export function stopNewsletterScheduler(): void {
  if (timer) { clearInterval(timer); timer = null; }
}
