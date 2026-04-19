/**
 * GET/POST /admin/cron/ebook-drip
 *
 * Cron-Endpoint: sendet alle fälligen Drip-Mails (scheduled_for <= NOW()
 * AND sent_at IS NULL) und markiert sie als versendet.
 *
 * Bearer-Token protected (ADMIN_TOKEN). Sinnvolle Schedule: täglich
 * (cron: "0 8 * * *" — 08:00 UTC ≙ 09-10 Uhr in DE).
 *
 * Idempotent: Mehrfache Runs am selben Tag schaden nichts, da sent_at
 * geprüft wird. Bei Mail-Fehler: attempts++ und last_error gesetzt —
 * Row bleibt für Retry im nächsten Run liegen.
 *
 * Max-Sends-per-Run ist gecappt, damit ein initialer Aufräumer bei
 * hunderten fälligen Rows nicht SendGrid-Rate-Limits triggert.
 */
import { Hono } from 'hono';
import { and, eq, isNull, lte, sql } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import {
  isSendGridEnabled,
  sendEbookDripStep,
} from '../../lib/sendgrid.js';
import { buildEbookAccessUrl } from '../../lib/ebook-access.js';
import { redactEmail } from '../../lib/log-helpers.js';
import { captureError } from '../../lib/sentry.js';
import { logAuditRaw } from '../../lib/audit.js';

const app = new Hono();

// Cap auf 100 Sends pro Run — SendGrid erlaubt deutlich mehr, aber wir
// wollen den Run zeitlich bounded halten. Wenn >100 Rows fällig sind,
// arbeitet der nächste Run den Rest ab. Bei täglicher Cron-Schedule +
// realistischen Kaufvolumen sollte das nie anschlagen.
const MAX_SENDS_PER_RUN = 100;

// Max 5 Versuche pro Row — danach als "dead-letter" liegen lassen und
// manuell inspizieren.
const MAX_ATTEMPTS = 5;

type DripStep = 'day1' | 'day7' | 'day30';

const VALID_STEPS: DripStep[] = ['day1', 'day7', 'day30'];
function isDripStep(s: string): s is DripStep {
  return (VALID_STEPS as string[]).includes(s);
}

async function runDripCron(): Promise<{
  ok: boolean;
  results: Record<string, unknown>;
  errors: string[];
}> {
  const start = Date.now();
  const results: Record<string, unknown> = {
    sent: 0,
    failed: 0,
    skippedNoPurchase: 0,
    skippedMaxAttempts: 0,
  };
  const errors: string[] = [];

  if (!isSendGridEnabled()) {
    return {
      ok: false,
      results,
      errors: ['SendGrid not configured — cron skipped'],
    };
  }

  // Fällige Drip-Rows laden (scheduled_for <= NOW() AND sent_at IS NULL).
  // attempts < MAX_ATTEMPTS filtert Dead-Letters raus.
  let due: Array<{
    id: number;
    email: string;
    dripStep: string;
    attempts: number;
  }> = [];
  try {
    due = await db
      .select({
        id: schema.ebookDripSchedule.id,
        email: schema.ebookDripSchedule.email,
        dripStep: schema.ebookDripSchedule.dripStep,
        attempts: schema.ebookDripSchedule.attempts,
      })
      .from(schema.ebookDripSchedule)
      .where(
        and(
          isNull(schema.ebookDripSchedule.sentAt),
          lte(schema.ebookDripSchedule.scheduledFor, new Date()),
        ),
      )
      .limit(MAX_SENDS_PER_RUN);
  } catch (err) {
    errors.push(`db-query: ${String(err)}`);
    return { ok: false, results, errors };
  }

  results.dueCount = due.length;

  for (const row of due) {
    if (row.attempts >= MAX_ATTEMPTS) {
      results.skippedMaxAttempts = (results.skippedMaxAttempts as number) + 1;
      continue;
    }
    if (!isDripStep(row.dripStep)) {
      errors.push(`row ${row.id}: unknown step ${row.dripStep}`);
      continue;
    }

    // Safety-Check: nur senden wenn der User noch einen 'paid'-Kauf hat.
    // Bei Refund/Chargeback wird die Drip-Kampagne gestoppt — das ist
    // rechtlich sauber (Newsletter-Opt-In gilt nur für aktive Kunden).
    try {
      const paid = await db
        .select({ id: schema.purchases.id })
        .from(schema.purchases)
        .where(
          and(
            eq(schema.purchases.email, row.email),
            eq(schema.purchases.status, 'paid'),
          ),
        )
        .limit(1);
      if (paid.length === 0) {
        // Mark as "sent" with a marker so we don't re-query forever.
        // last_error dokumentiert warum.
        await db
          .update(schema.ebookDripSchedule)
          .set({
            sentAt: new Date(),
            lastError: 'skipped: no paid purchase',
          })
          .where(eq(schema.ebookDripSchedule.id, row.id));
        results.skippedNoPurchase = (results.skippedNoPurchase as number) + 1;
        continue;
      }
    } catch (err) {
      errors.push(`purchase-check row ${row.id}: ${String(err)}`);
      continue;
    }

    // Access-URL pro Row neu berechnen — günstig (HMAC), und bleibt so
    // frisch, falls EBOOK_ACCESS_SECRET mal rotiert wurde.
    let accessUrl: string;
    try {
      accessUrl = buildEbookAccessUrl(row.email);
    } catch (err) {
      errors.push(`access-url row ${row.id}: ${String(err)}`);
      continue;
    }

    const sent = await sendEbookDripStep(row.dripStep, row.email, accessUrl);

    if (sent.ok) {
      try {
        await db
          .update(schema.ebookDripSchedule)
          .set({
            sentAt: new Date(),
            attempts: sql`${schema.ebookDripSchedule.attempts} + 1`,
            lastError: null,
          })
          .where(eq(schema.ebookDripSchedule.id, row.id));
        results.sent = (results.sent as number) + 1;
      } catch (err) {
        errors.push(`mark-sent row ${row.id}: ${String(err)}`);
      }
    } else {
      try {
        await db
          .update(schema.ebookDripSchedule)
          .set({
            attempts: sql`${schema.ebookDripSchedule.attempts} + 1`,
            lastError: String(sent.error || sent.status || 'unknown').slice(0, 1000),
          })
          .where(eq(schema.ebookDripSchedule.id, row.id));
      } catch (err) {
        errors.push(`mark-failed row ${row.id}: ${String(err)}`);
      }
      results.failed = (results.failed as number) + 1;
      console.error(
        '[drip-cron] send failed',
        row.dripStep,
        redactEmail(row.email),
        sent.error,
      );
    }
  }

  results.durationMs = Date.now() - start;

  // Audit-Trail — hilft bei Debugging "wurde der Cron heute getriggert?"
  try {
    await logAuditRaw({
      action: 'cron.ebook-drip',
      actor: 'system',
      meta: { ...(results as Record<string, unknown>), errors: errors.length },
    });
  } catch (err) {
    // nicht blocken
    console.error('[drip-cron] audit log failed:', err);
  }

  return { ok: errors.length === 0, results, errors };
}

app.post('/', async (c) => {
  try {
    const outcome = await runDripCron();
    return c.json({ ...outcome, ts: new Date().toISOString() });
  } catch (err) {
    console.error('[drip-cron] fatal:', err);
    captureError(err, { route: 'admin/ebook-drip' });
    return c.json({ ok: false, error: String(err) }, 500);
  }
});

// GET-Alias für Scheduler die nur GET können.
app.get('/', async (c) => {
  try {
    const outcome = await runDripCron();
    return c.json({ ...outcome, ts: new Date().toISOString() });
  } catch (err) {
    console.error('[drip-cron] fatal:', err);
    captureError(err, { route: 'admin/ebook-drip' });
    return c.json({ ok: false, error: String(err) }, 500);
  }
});

export default app;
