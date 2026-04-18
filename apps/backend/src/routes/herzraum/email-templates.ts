/**
 * Email-Template-Endpoints (session-auth'd, unter /herzraum/* gemountet).
 *
 *   GET  /herzraum/email-templates            → Liste (id, name, variables, category)
 *   GET  /herzraum/email-templates/:id/preview?withData=1  → rendered HTML + text + subject
 *   POST /herzraum/email-templates/:id/test   → sendet Test-Mail an { email, data? }
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { emailTemplates, getEmailTemplate } from '../../lib/email-templates.js';
import { logAudit } from '../../lib/audit.js';

const app = new Hono();

app.get('/', (c) => {
  return c.json({
    ok: true,
    total: emailTemplates.length,
    templates: emailTemplates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      subject: t.subject,
      preheader: t.preheader,
      variables: t.variables,
      previewData: t.previewData,
    })),
  });
});

app.get('/:id/preview', (c) => {
  const id = c.req.param('id');
  const tpl = getEmailTemplate(id);
  if (!tpl) return c.json({ ok: false, error: 'not-found' }, 404);

  // Use previewData merged with any query overrides (for "live" data tests)
  const data: Record<string, string> = { ...tpl.previewData };
  const queryData = c.req.query();
  for (const [k, v] of Object.entries(queryData)) {
    if (k.startsWith('d_')) data[k.slice(2)] = v;
  }

  const baseUrl = process.env.PUBLIC_BASE_URL || 'https://herzblatt-journal.com';
  const rendered = tpl.render(data, {
    baseUrl,
    unsubscribeUrl: `${baseUrl}/api/unsubscribe?email=preview@example.com&token=demo`,
  });

  return c.json({
    ok: true,
    template: { id: tpl.id, name: tpl.name, category: tpl.category },
    rendered,
    dataUsed: data,
  });
});

// HTML raw — nützlich für iframe.srcdoc
app.get('/:id/html', (c) => {
  const id = c.req.param('id');
  const tpl = getEmailTemplate(id);
  if (!tpl) return c.text('not-found', 404);

  const data: Record<string, string> = { ...tpl.previewData };
  const queryData = c.req.query();
  for (const [k, v] of Object.entries(queryData)) {
    if (k.startsWith('d_')) data[k.slice(2)] = v;
  }

  const baseUrl = process.env.PUBLIC_BASE_URL || 'https://herzblatt-journal.com';
  const rendered = tpl.render(data, {
    baseUrl,
    unsubscribeUrl: `${baseUrl}/api/unsubscribe?email=preview@example.com&token=demo`,
  });
  return new Response(rendered.html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
});

const testSchema = z.object({
  email: z.string().email(),
  data: z.record(z.string()).optional(),
});

app.post('/:id/test', async (c) => {
  const id = c.req.param('id');
  const tpl = getEmailTemplate(id);
  if (!tpl) return c.json({ ok: false, error: 'not-found' }, 404);

  let body: unknown;
  try { body = await c.req.json(); }
  catch { return c.json({ ok: false, error: 'invalid-json' }, 400); }

  const parsed = testSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'validation', issues: parsed.error.issues }, 400);
  }

  const data = { ...tpl.previewData, ...(parsed.data.data || {}) };
  const baseUrl = process.env.PUBLIC_BASE_URL || 'https://herzblatt-journal.com';
  const rendered = tpl.render(data, {
    baseUrl,
    unsubscribeUrl: `${baseUrl}/api/unsubscribe?email=${encodeURIComponent(parsed.data.email)}&token=test`,
  });

  // SG-send via main-account key
  const sgKey = process.env.SENDGRID_API_KEY;
  if (!sgKey) {
    return c.json({ ok: false, error: 'SENDGRID_API_KEY not configured' }, 500);
  }

  const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'support@herzblatt-journal.de';
  const fromName = process.env.SENDGRID_FROM_NAME || 'Herzblatt Journal';

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${sgKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: { email: fromEmail, name: fromName },
      personalizations: [{ to: [{ email: parsed.data.email }] }],
      subject: rendered.subject,
      content: [
        { type: 'text/plain', value: rendered.text },
        { type: 'text/html', value: rendered.html },
      ],
      headers: {
        'List-Unsubscribe': `<${baseUrl}/api/unsubscribe?email=${encodeURIComponent(parsed.data.email)}&token=test>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    return c.json({ ok: false, error: `SendGrid ${res.status}: ${errText}` }, 500);
  }

  void logAudit(c, { action: 'email-template.test', target: id, meta: { email: parsed.data.email } });

  return c.json({
    ok: true,
    id,
    sentTo: parsed.data.email,
    subject: rendered.subject,
    sgStatus: res.status,
  });
});

// ─── BROADCAST: an alle Subscribers senden ─────────────────

import { sql, isNull } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { createHmac } from 'node:crypto';

const broadcastSchema = z.object({
  confirmText: z.literal('SENDE AN ALLE'),
  data: z.record(z.string()).optional(),
  dryRun: z.boolean().optional().default(false),
});

function buildUnsubToken(email: string): string {
  const secret = process.env.UNSUBSCRIBE_SECRET || process.env.IP_SALT || 'fallback';
  return createHmac('sha256', secret).update(email.toLowerCase().trim()).digest('hex').slice(0, 32);
}

app.post('/:id/broadcast', async (c) => {
  const id = c.req.param('id');
  const tpl = getEmailTemplate(id);
  if (!tpl) return c.json({ ok: false, error: 'template-not-found' }, 404);

  let rawBody: unknown;
  try { rawBody = await c.req.json(); }
  catch { return c.json({ ok: false, error: 'invalid-json' }, 400); }

  const parsed = broadcastSchema.safeParse(rawBody);
  if (!parsed.success) {
    return c.json({
      ok: false,
      error: 'confirmation-required',
      hint: 'Body muss enthalten: { "confirmText": "SENDE AN ALLE" }',
    }, 400);
  }

  const sgKey = process.env.SENDGRID_API_KEY;
  if (!sgKey) return c.json({ ok: false, error: 'SENDGRID_API_KEY not configured' }, 500);

  // Rate-Limit: max 3 broadcasts/h
  try {
    const recent = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt FROM audit_log
      WHERE action = 'email.broadcast' AND ts > NOW() - INTERVAL '1 hour'
    `);
    const cnt = Number((recent as any)[0]?.cnt || 0);
    if (cnt >= 3) {
      return c.json({ ok: false, error: 'rate-limit', message: 'Max 3 Broadcasts pro Stunde.' }, 429);
    }
  } catch { /* best-effort */ }

  const subscribers = await db
    .select({ email: schema.subscribers.email })
    .from(schema.subscribers)
    .where(isNull(schema.subscribers.unsubscribedAt));

  if (subscribers.length > 5000) {
    return c.json({ ok: false, error: 'too-many', count: subscribers.length, max: 5000 }, 400);
  }
  if (subscribers.length === 0) {
    return c.json({ ok: false, error: 'no-active-subscribers' }, 400);
  }

  const baseUrl = process.env.PUBLIC_BASE_URL || 'https://herzblatt-journal.com';
  const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'support@herzblatt-journal.de';
  const fromName = process.env.SENDGRID_FROM_NAME || 'Herzblatt Journal';
  const data = { ...tpl.previewData, ...(parsed.data.data || {}) };

  if (parsed.data.dryRun) {
    const sample = subscribers.slice(0, 3).map((s) => {
      const unsubUrl = `${baseUrl}/api/unsubscribe?email=${encodeURIComponent(s.email)}&token=${buildUnsubToken(s.email)}`;
      const r = tpl.render({ ...data, first_name: '' }, { baseUrl, unsubscribeUrl: unsubUrl });
      return { email: s.email, subject: r.subject };
    });
    return c.json({ ok: true, dryRun: true, recipientCount: subscribers.length, sample });
  }

  let sent = 0, failed = 0;
  const errors: string[] = [];

  for (const s of subscribers) {
    const unsubUrl = `${baseUrl}/api/unsubscribe?email=${encodeURIComponent(s.email)}&token=${buildUnsubToken(s.email)}`;
    const rendered = tpl.render({ ...data, first_name: '' }, { baseUrl, unsubscribeUrl: unsubUrl });
    try {
      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${sgKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: { email: fromEmail, name: fromName },
          personalizations: [{ to: [{ email: s.email }] }],
          subject: rendered.subject,
          content: [
            { type: 'text/plain', value: rendered.text },
            { type: 'text/html', value: rendered.html },
          ],
          headers: {
            'List-Unsubscribe': `<${unsubUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
          custom_args: { template_id: id, broadcast: '1' },
        }),
      });
      if (res.ok) sent++;
      else { failed++; if (errors.length < 5) errors.push(`${s.email}: HTTP ${res.status}`); }
    } catch (err) {
      failed++;
      if (errors.length < 5) errors.push(`${s.email}: ${String(err)}`);
    }
  }

  void logAudit(c, {
    action: 'email.broadcast',
    target: id,
    meta: { totalRecipients: subscribers.length, sent, failed },
  });

  return c.json({
    ok: failed === 0,
    templateId: id,
    totalRecipients: subscribers.length,
    sent,
    failed,
    errors: errors.length ? errors : undefined,
  });
});

export default app;
