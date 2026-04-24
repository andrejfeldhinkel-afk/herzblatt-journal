/**
 * /herzraum/newsletter-broadcast — Admin-Mass-Mails an alle Subscribers.
 *
 * Mount: `/herzraum/newsletter-broadcast/*` (session + CSRF sind vom Parent
 * Router gesetzt).
 *
 * Endpoints:
 *   GET    /                 — paginierte Liste (20/page), ?page=1
 *   GET    /:id              — Detail eines Broadcasts
 *   POST   /                 — Draft anlegen { subject, articleSlug?, bodyHtml }
 *   PATCH  /:id              — Draft editieren (nur wenn status='draft', sonst 409)
 *   POST   /:id/send         — Broadcast an alle active Subscribers senden
 *   POST   /:id/test         — Testmail an einzelne Adresse (keine Status-Änderung)
 *   DELETE /:id              — nur wenn status='draft'
 *
 * Status-Transitionen:
 *   draft → sending → sent|failed   (nur draft kann gelöscht werden)
 *
 * Rate-Limit: max 1 Send pro 5 Minuten über ALLE Broadcasts hinweg
 * (verhindert versehentliches Doppel-Klicken).
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { and, desc, eq, isNull, count, sql } from 'drizzle-orm';
import sanitizeHtml from 'sanitize-html';
import { db, schema } from '../../db/index.js';
import { logAudit } from '../../lib/audit.js';
import { sendBroadcastEmail, isSendGridEnabled } from '../../lib/sendgrid.js';
import { allowRequest } from '../../lib/rate-limit.js';

// Sanitize-Config für Newsletter-HTML.
// Admin ist zwar eingeloggt + trusted — aber ein gestohlener Account
// könnte sonst Scripts/onclick/Iframes via E-Mail an alle Subscriber schicken
// (Phishing-Vektor). Wir erlauben nur E-Mail-taugliches Markup.
const NEWSLETTER_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p','br','strong','b','em','i','u','s','del',
    'a','img','blockquote','code','pre',
    'ul','ol','li',
    'h1','h2','h3','h4','h5','h6',
    'hr','table','thead','tbody','tr','td','th',
    'div','span','figure','figcaption',
  ],
  allowedAttributes: {
    a: ['href','title','target','rel'],
    img: ['src','alt','title','width','height','style'],
    '*': ['style','class'],
  },
  allowedSchemes: ['http','https','mailto'],
  allowedSchemesByTag: { img: ['http','https','data'] },
  // style-Tag wird weiter unten inline-attr-white-listed; externe <style> bleiben raus
  allowedStyles: {
    '*': {
      color: [/.+/],
      'background-color': [/.+/],
      'text-align': [/^(left|right|center|justify)$/],
      'font-size': [/.+/],
      'font-weight': [/.+/],
      'text-decoration': [/.+/],
      padding: [/.+/],
      margin: [/.+/],
      border: [/.+/],
      'border-radius': [/.+/],
      width: [/.+/],
      'max-width': [/.+/],
      height: [/.+/],
    },
  },
  // Keine Data-Attribute außer auf img (src=data: für inline-Bilder)
  transformTags: {
    a: (tagName, attribs) => {
      // Alle externen Links bekommen rel=noopener target=_blank für Mail-Clients
      // die sie doch mal im Browser rendern.
      const href = attribs.href || '';
      const isExternal = /^https?:\/\//i.test(href);
      return {
        tagName: 'a',
        attribs: {
          ...attribs,
          ...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {}),
        },
      };
    },
  },
};

function sanitizeNewsletterHtml(html: string): string {
  return sanitizeHtml(html, NEWSLETTER_SANITIZE_OPTIONS);
}

const app = new Hono();

const createSchema = z.object({
  subject: z.string().min(3).max(300),
  articleSlug: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{2,80}$/, 'invalid-slug')
    .max(80)
    .optional()
    .nullable(),
  bodyHtml: z.string().min(20).max(200_000),
});

// PATCH erlaubt Teil-Updates — alle Felder optional, mind. eins muss gesetzt sein.
const patchSchema = z
  .object({
    subject: z.string().min(3).max(300).optional(),
    articleSlug: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]{2,80}$/, 'invalid-slug')
      .max(80)
      .nullable()
      .optional(),
    bodyHtml: z.string().min(20).max(200_000).optional(),
  })
  .refine(
    (v) => v.subject !== undefined || v.articleSlug !== undefined || v.bodyHtml !== undefined,
    { message: 'no-fields-to-update' },
  );

const testSchema = z.object({
  email: z.string().email().max(254),
});

// ─── GET / (paginated list) ───────────────────────────────────
app.get('/', async (c) => {
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10) || 1);
  const PAGE_SIZE = 20;
  const offset = (page - 1) * PAGE_SIZE;

  // Defensiver Try/Catch — wenn irgendwas in DB-Query schief läuft
  // (z.B. Column fehlt wg. Deploy-Race-Condition, DB-Connection-Drop),
  // liefern wir einen strukturierten Fehler statt den Error nach oben zu
  // werfen und den generischen 500-Handler zu triggern. Damit sieht der
  // Admin "Fehler beim Laden" + Console-Log mit Details statt "Internal
  // Server Error" ohne Kontext.
  try {
    const [rows, totalRow] = await Promise.all([
      db
        .select({
          id: schema.newsletterBroadcasts.id,
          subject: schema.newsletterBroadcasts.subject,
          articleSlug: schema.newsletterBroadcasts.articleSlug,
          status: schema.newsletterBroadcasts.status,
          sentAt: schema.newsletterBroadcasts.sentAt,
          scheduledFor: schema.newsletterBroadcasts.scheduledFor,
          recipientCount: schema.newsletterBroadcasts.recipientCount,
          successCount: schema.newsletterBroadcasts.successCount,
          createdBy: schema.newsletterBroadcasts.createdBy,
          createdAt: schema.newsletterBroadcasts.createdAt,
        })
        .from(schema.newsletterBroadcasts)
        .orderBy(desc(schema.newsletterBroadcasts.createdAt))
        .limit(PAGE_SIZE)
        .offset(offset),
      db.select({ n: count() }).from(schema.newsletterBroadcasts),
    ]);

    const total = Number(totalRow[0]?.n || 0);
    return c.json({
      ok: true,
      page,
      pageSize: PAGE_SIZE,
      total,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      broadcasts: rows,
      sendgridEnabled: isSendGridEnabled(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[newsletter-broadcast] GET / failed:', msg);
    // Häufigste Ursache: `scheduled_for`-Column fehlt weil Migration noch
    // nicht durchgelaufen ist. Wir liefern die Liste trotzdem, nur ohne
    // scheduledFor, statt komplett zu brechen.
    if (/column.*scheduled_for.*does not exist/i.test(msg)) {
      try {
        const [rows, totalRow] = await Promise.all([
          db
            .select({
              id: schema.newsletterBroadcasts.id,
              subject: schema.newsletterBroadcasts.subject,
              articleSlug: schema.newsletterBroadcasts.articleSlug,
              status: schema.newsletterBroadcasts.status,
              sentAt: schema.newsletterBroadcasts.sentAt,
              recipientCount: schema.newsletterBroadcasts.recipientCount,
              successCount: schema.newsletterBroadcasts.successCount,
              createdBy: schema.newsletterBroadcasts.createdBy,
              createdAt: schema.newsletterBroadcasts.createdAt,
            })
            .from(schema.newsletterBroadcasts)
            .orderBy(desc(schema.newsletterBroadcasts.createdAt))
            .limit(PAGE_SIZE)
            .offset(offset),
          db.select({ n: count() }).from(schema.newsletterBroadcasts),
        ]);
        const total = Number(totalRow[0]?.n || 0);
        return c.json({
          ok: true,
          page, pageSize: PAGE_SIZE, total,
          totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
          broadcasts: rows.map((r) => ({ ...r, scheduledFor: null })),
          sendgridEnabled: isSendGridEnabled(),
          warning: 'scheduled_for column missing — run migrations',
        });
      } catch { /* fall through zum 500 */ }
    }
    return c.json({ ok: false, error: 'list-failed', message: msg.slice(0, 300) }, 500);
  }
});

// ─── GET /:id (detail) ─────────────────────────────────────────
app.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (!Number.isInteger(id) || id < 1) {
    return c.json({ ok: false, error: 'invalid-id' }, 400);
  }
  const [row] = await db
    .select()
    .from(schema.newsletterBroadcasts)
    .where(eq(schema.newsletterBroadcasts.id, id))
    .limit(1);

  if (!row) return c.json({ ok: false, error: 'not-found' }, 404);
  return c.json({ ok: true, broadcast: row });
});

// ─── POST / (create draft) ────────────────────────────────────
app.post('/', async (c) => {
  let body: unknown;
  try { body = await c.req.json(); }
  catch { return c.json({ ok: false, error: 'invalid-json' }, 400); }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'validation', issues: parsed.error.flatten() }, 400);
  }

  const cleanHtml = sanitizeNewsletterHtml(parsed.data.bodyHtml);
  if (cleanHtml.length < 20) {
    return c.json({ ok: false, error: 'html-empty-after-sanitize' }, 400);
  }

  const [created] = await db
    .insert(schema.newsletterBroadcasts)
    .values({
      subject: parsed.data.subject,
      articleSlug: parsed.data.articleSlug || null,
      bodyHtml: cleanHtml,
      status: 'draft',
    })
    .returning();

  await logAudit(c, {
    action: 'newsletter.broadcast.create',
    target: String(created.id),
    meta: {
      subject: parsed.data.subject.slice(0, 120),
      articleSlug: parsed.data.articleSlug || null,
    },
  });

  return c.json({ ok: true, broadcast: created }, 201);
});

// ─── PATCH /:id (edit draft) ──────────────────────────────────
// Nur erlaubt wenn status='draft'. Atomar via WHERE-Bedingung im UPDATE,
// damit ein paralleles "Send" das Draft nicht mitten im Edit überschreibt.
app.patch('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (!Number.isInteger(id) || id < 1) {
    return c.json({ ok: false, error: 'invalid-id' }, 400);
  }

  let body: unknown;
  try { body = await c.req.json(); }
  catch { return c.json({ ok: false, error: 'invalid-json' }, 400); }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'validation', issues: parsed.error.flatten() }, 400);
  }

  // Nur tatsächlich gesetzte Felder ins UPDATE schicken (kein versehentliches NULL).
  const updates: Record<string, unknown> = {};
  if (parsed.data.subject !== undefined) updates.subject = parsed.data.subject;
  if (parsed.data.articleSlug !== undefined) updates.articleSlug = parsed.data.articleSlug;
  if (parsed.data.bodyHtml !== undefined) {
    const cleaned = sanitizeNewsletterHtml(parsed.data.bodyHtml);
    if (cleaned.length < 20) {
      return c.json({ ok: false, error: 'html-empty-after-sanitize' }, 400);
    }
    updates.bodyHtml = cleaned;
  }

  // Atomarer UPDATE … WHERE status='draft' verhindert Edit nach Send-Start.
  const updated = await db
    .update(schema.newsletterBroadcasts)
    .set(updates)
    .where(
      and(
        eq(schema.newsletterBroadcasts.id, id),
        eq(schema.newsletterBroadcasts.status, 'draft'),
      ),
    )
    .returning();

  if (updated.length === 0) {
    const [existing] = await db
      .select({ status: schema.newsletterBroadcasts.status })
      .from(schema.newsletterBroadcasts)
      .where(eq(schema.newsletterBroadcasts.id, id))
      .limit(1);
    if (!existing) return c.json({ ok: false, error: 'not-found' }, 404);
    return c.json(
      {
        ok: false,
        error: 'invalid-status',
        message: 'Nur draft-Broadcasts können editiert werden.',
        status: existing.status,
      },
      409,
    );
  }

  await logAudit(c, {
    action: 'newsletter.broadcast.update',
    target: String(id),
    meta: {
      fields: Object.keys(updates),
      subject: updates.subject ? String(updates.subject).slice(0, 120) : undefined,
    },
  });

  return c.json({ ok: true, broadcast: updated[0] });
});

// ─── POST /:id/test (single-address test send) ────────────────
app.post('/:id/test', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (!Number.isInteger(id) || id < 1) {
    return c.json({ ok: false, error: 'invalid-id' }, 400);
  }

  let body: unknown;
  try { body = await c.req.json(); }
  catch { return c.json({ ok: false, error: 'invalid-json' }, 400); }

  const parsed = testSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'validation', issues: parsed.error.flatten() }, 400);
  }

  const [row] = await db
    .select()
    .from(schema.newsletterBroadcasts)
    .where(eq(schema.newsletterBroadcasts.id, id))
    .limit(1);
  if (!row) return c.json({ ok: false, error: 'not-found' }, 404);

  if (!isSendGridEnabled()) {
    return c.json({ ok: false, error: 'sendgrid-not-configured' }, 503);
  }

  const result = await sendBroadcastEmail(
    `[TEST] ${row.subject}`,
    row.bodyHtml,
    [parsed.data.email.toLowerCase().trim()],
  );

  await logAudit(c, {
    action: 'newsletter.broadcast.test',
    target: String(id),
    meta: { to: parsed.data.email, sent: result.sent, failed: result.failed },
  });

  return c.json({
    ok: result.sent > 0,
    sent: result.sent,
    failed: result.failed,
    errors: result.errors.slice(0, 3),
  });
});

// ─── POST /:id/schedule — Draft für später planen ─────────────
// Setzt status='scheduled' + scheduled_for=<ts>. Ein Scheduler-Interval
// im Backend-Boot (siehe lib/newsletter-scheduler.ts) findet fällige
// Broadcasts und löst den Send atomar aus.
const scheduleSchema = z.object({
  // ISO-8601-Timestamp (client sendet UTC). Mind. 2 Min in der Zukunft,
  // max. 90 Tage — verhindert aus-Versehen-Senden + vergessene Zombies.
  scheduledFor: z.string().datetime({ offset: true }),
});

app.post('/:id/schedule', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (!Number.isInteger(id) || id < 1) {
    return c.json({ ok: false, error: 'invalid-id' }, 400);
  }

  let body: unknown;
  try { body = await c.req.json(); }
  catch { return c.json({ ok: false, error: 'invalid-json' }, 400); }

  const parsed = scheduleSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'validation', issues: parsed.error.flatten() }, 400);
  }

  const when = new Date(parsed.data.scheduledFor);
  const now = Date.now();
  const MIN_LEAD_MS = 2 * 60 * 1000;
  const MAX_LEAD_MS = 90 * 24 * 60 * 60 * 1000;
  if (when.getTime() - now < MIN_LEAD_MS) {
    return c.json({ ok: false, error: 'too-soon', message: 'Mind. 2 Minuten in der Zukunft.' }, 400);
  }
  if (when.getTime() - now > MAX_LEAD_MS) {
    return c.json({ ok: false, error: 'too-far', message: 'Max. 90 Tage in der Zukunft.' }, 400);
  }

  // Atomar von 'draft' → 'scheduled'. Verhindert Race mit paralleler Send/Delete-Op.
  const claimed = await db
    .update(schema.newsletterBroadcasts)
    .set({ status: 'scheduled', scheduledFor: when })
    .where(
      and(
        eq(schema.newsletterBroadcasts.id, id),
        eq(schema.newsletterBroadcasts.status, 'draft'),
      ),
    )
    .returning();

  if (claimed.length === 0) {
    const [existing] = await db
      .select()
      .from(schema.newsletterBroadcasts)
      .where(eq(schema.newsletterBroadcasts.id, id))
      .limit(1);
    if (!existing) return c.json({ ok: false, error: 'not-found' }, 404);
    return c.json({ ok: false, error: 'invalid-status', status: existing.status }, 409);
  }

  await logAudit(c, {
    action: 'newsletter.broadcast.schedule',
    target: String(id),
    meta: { scheduledFor: when.toISOString() },
  });

  return c.json({ ok: true, broadcast: claimed[0] });
});

// ─── POST /:id/unschedule — Scheduled zurück zu Draft ──────────
app.post('/:id/unschedule', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (!Number.isInteger(id) || id < 1) {
    return c.json({ ok: false, error: 'invalid-id' }, 400);
  }

  const claimed = await db
    .update(schema.newsletterBroadcasts)
    .set({ status: 'draft', scheduledFor: null })
    .where(
      and(
        eq(schema.newsletterBroadcasts.id, id),
        eq(schema.newsletterBroadcasts.status, 'scheduled'),
      ),
    )
    .returning();

  if (claimed.length === 0) {
    return c.json({ ok: false, error: 'not-scheduled' }, 409);
  }

  await logAudit(c, {
    action: 'newsletter.broadcast.unschedule',
    target: String(id),
  });

  return c.json({ ok: true, broadcast: claimed[0] });
});

// ─── POST /:id/send (real mass send) ──────────────────────────
// Globaler Rate-Limit-Key — 1 Send pro 5 Min über alle Broadcasts.
const SEND_RATE_LIMIT_KEY = 'newsletter-broadcast:send';
const FIVE_MINUTES_MS = 5 * 60 * 1000;

app.post('/:id/send', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (!Number.isInteger(id) || id < 1) {
    return c.json({ ok: false, error: 'invalid-id' }, 400);
  }

  if (!allowRequest(SEND_RATE_LIMIT_KEY, 1, FIVE_MINUTES_MS)) {
    return c.json(
      {
        ok: false,
        error: 'rate-limited',
        message: 'Letzter Send liegt unter 5 Min zurück. Warte kurz um versehentliches Doppelsenden zu vermeiden.',
      },
      429,
    );
  }

  if (!isSendGridEnabled()) {
    return c.json({ ok: false, error: 'sendgrid-not-configured' }, 503);
  }

  // Atomar den Status auf 'sending' setzen — nur wenn aktuell 'draft' ist.
  // Verhindert Double-Send-Race selbst ohne Rate-Limiter.
  const claimResult = await db
    .update(schema.newsletterBroadcasts)
    .set({ status: 'sending' })
    .where(
      and(
        eq(schema.newsletterBroadcasts.id, id),
        eq(schema.newsletterBroadcasts.status, 'draft'),
      ),
    )
    .returning();

  if (claimResult.length === 0) {
    // Entweder gibts den Broadcast nicht, oder er ist nicht mehr draft.
    const [existing] = await db
      .select()
      .from(schema.newsletterBroadcasts)
      .where(eq(schema.newsletterBroadcasts.id, id))
      .limit(1);
    if (!existing) return c.json({ ok: false, error: 'not-found' }, 404);
    return c.json(
      { ok: false, error: 'invalid-status', status: existing.status },
      409,
    );
  }

  const row = claimResult[0];

  // Empfänger holen: alle active Subscribers (unsubscribed_at IS NULL).
  const subsRows = await db
    .select({ email: schema.subscribers.email })
    .from(schema.subscribers)
    .where(isNull(schema.subscribers.unsubscribedAt));

  const recipients = subsRows.map((r) => r.email.toLowerCase().trim()).filter(Boolean);

  try {
    const result = await sendBroadcastEmail(row.subject, row.bodyHtml, recipients);

    await db
      .update(schema.newsletterBroadcasts)
      .set({
        status: 'sent',
        sentAt: new Date(),
        recipientCount: recipients.length,
        successCount: result.sent,
      })
      .where(eq(schema.newsletterBroadcasts.id, id));

    await logAudit(c, {
      action: 'newsletter.broadcast.send',
      target: String(id),
      meta: {
        subject: row.subject.slice(0, 120),
        recipients: recipients.length,
        sent: result.sent,
        failed: result.failed,
      },
    });

    return c.json({
      ok: true,
      broadcastId: id,
      recipientCount: recipients.length,
      successCount: result.sent,
      failureCount: result.failed,
      errors: result.errors.slice(0, 5),
    });
  } catch (err) {
    console.error('[newsletter-broadcast] send failed:', err);
    await db
      .update(schema.newsletterBroadcasts)
      .set({ status: 'failed', recipientCount: recipients.length, successCount: 0 })
      .where(eq(schema.newsletterBroadcasts.id, id));
    await logAudit(c, {
      action: 'newsletter.broadcast.send-failed',
      target: String(id),
      meta: { error: String(err).slice(0, 400) },
    });
    return c.json({ ok: false, error: 'send-failed', message: String(err) }, 500);
  }
});

// ─── DELETE /:id (draft only) ─────────────────────────────────
app.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (!Number.isInteger(id) || id < 1) {
    return c.json({ ok: false, error: 'invalid-id' }, 400);
  }

  // Delete nur wenn status='draft' — conditional delete atomic via WHERE.
  const deleted = await db
    .delete(schema.newsletterBroadcasts)
    .where(
      and(
        eq(schema.newsletterBroadcasts.id, id),
        eq(schema.newsletterBroadcasts.status, 'draft'),
      ),
    )
    .returning({ id: schema.newsletterBroadcasts.id });

  if (deleted.length === 0) {
    const [existing] = await db
      .select({ status: schema.newsletterBroadcasts.status })
      .from(schema.newsletterBroadcasts)
      .where(eq(schema.newsletterBroadcasts.id, id))
      .limit(1);
    if (!existing) return c.json({ ok: false, error: 'not-found' }, 404);
    return c.json(
      { ok: false, error: 'invalid-status', message: 'Nur draft-Broadcasts können gelöscht werden.', status: existing.status },
      409,
    );
  }

  await logAudit(c, {
    action: 'newsletter.broadcast.delete',
    target: String(id),
  });

  return c.json({ ok: true });
});

// ─── Stats endpoint for UI header ──────────────────────────────
app.get('/meta/stats', async (c) => {
  const [activeSubs] = await db
    .select({ n: count() })
    .from(schema.subscribers)
    .where(isNull(schema.subscribers.unsubscribedAt));

  return c.json({
    ok: true,
    activeSubscribers: Number(activeSubs?.n || 0),
    sendgridEnabled: isSendGridEnabled(),
  });
});

// Re-exported for tests
export { SEND_RATE_LIMIT_KEY, FIVE_MINUTES_MS };

export default app;
