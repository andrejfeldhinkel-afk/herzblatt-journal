/**
 * Admin-Endpoints für SendGrid.
 *
 * Bearer-ADMIN_TOKEN protected (Mount erfolgt unter /admin/*).
 *
 *  GET  /admin/sendgrid/status  → zeigt ob SG aktiv ist + env-check
 *  POST /admin/sendgrid/sync    → pusht alle DB-Subscribers (emails) an SG
 *  POST /admin/sendgrid/test    → sendet 1 Test-Welcome-Mail (Body: {email})
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { desc } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import {
  isSendGridEnabled,
  bulkSyncContacts,
  sendWelcomeEmail,
  addContactToList,
} from '../../lib/sendgrid.js';

const app = new Hono();

app.get('/status', (c) => {
  return c.json({
    enabled: isSendGridEnabled(),
    config: {
      hasApiKey: !!process.env.SENDGRID_API_KEY,
      hasListId: !!process.env.SENDGRID_LIST_ID,
      fromEmail: process.env.SENDGRID_FROM_EMAIL || null,
      fromName: process.env.SENDGRID_FROM_NAME || null,
      hasWelcomeTemplate: !!process.env.SENDGRID_WELCOME_TEMPLATE_ID,
    },
  });
});

app.post('/sync', async (c) => {
  if (!isSendGridEnabled()) {
    return c.json({ ok: false, error: 'SENDGRID_API_KEY not set' }, 400);
  }

  const rows = await db
    .select({ email: schema.subscribers.email })
    .from(schema.subscribers)
    .orderBy(desc(schema.subscribers.createdAt));

  const emails = rows.map((r) => r.email).filter(Boolean);
  if (emails.length === 0) {
    return c.json({ ok: true, totalSubscribers: 0, synced: 0, message: 'no subscribers' });
  }

  const result = await bulkSyncContacts(emails);
  return c.json({
    ok: result.ok,
    totalSubscribers: emails.length,
    synced: result.totalSent,
    batches: result.batches,
    errors: result.errors,
  });
});

const testBodySchema = z.object({
  email: z.string().email(),
});

app.post('/test', async (c) => {
  if (!isSendGridEnabled()) {
    return c.json({ ok: false, error: 'SENDGRID_API_KEY not set' }, 400);
  }

  let body: unknown;
  try { body = await c.req.json(); }
  catch { return c.json({ ok: false, error: 'invalid JSON body' }, 400); }

  const parsed = testBodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'email required' }, 400);
  }

  const email = parsed.data.email;

  const [contactRes, welcomeRes] = await Promise.all([
    addContactToList(email, { source: 'admin-test' }),
    sendWelcomeEmail(email),
  ]);

  return c.json({
    ok: contactRes.ok && welcomeRes.ok,
    contactAdd: contactRes,
    welcomeEmail: welcomeRes,
  });
});

export default app;
