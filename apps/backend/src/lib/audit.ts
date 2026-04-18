/**
 * Audit-Log helper — loggt alle schreibenden Admin-Actions.
 *
 * Actions naming convention: "<domain>.<verb>"
 *   article.create, article.update, article.delete
 *   author.update
 *   redirect.create, redirect.delete
 *   sendgrid.sync, sendgrid.test
 *   gdpr.delete, gdpr.export
 *   cron.cleanup
 *   auth.login, auth.logout
 */
import type { Context } from 'hono';
import { db, schema } from '../db/index.js';
import { getClientIp, hashIp } from './crypto.js';

export interface AuditOpts {
  action: string;
  target?: string;
  meta?: Record<string, unknown>;
  actor?: string;
}

/**
 * Fire-and-forget audit log — schreibt in die `audit_log`-Tabelle.
 * Failures werden geloggt aber nicht propagated (darf den Request nicht blocken).
 */
export async function logAudit(c: Context, opts: AuditOpts): Promise<void> {
  try {
    const ip = getClientIp(c.req.raw, c.req.raw.headers);
    const ipH = hashIp(ip);
    await db.insert(schema.auditLog).values({
      actor: opts.actor || 'admin',
      action: opts.action,
      target: opts.target || null,
      ipHash: ipH,
      meta: opts.meta ? JSON.stringify(opts.meta).slice(0, 5000) : null,
    });
  } catch (err) {
    console.error('[audit] log failed:', err);
  }
}

/**
 * Sync-Version falls Hono-Context nicht verfügbar (z.B. Cron-Jobs).
 */
export async function logAuditRaw(opts: {
  action: string;
  target?: string;
  meta?: Record<string, unknown>;
  actor?: string;
  ipHash?: string;
}): Promise<void> {
  try {
    await db.insert(schema.auditLog).values({
      actor: opts.actor || 'system',
      action: opts.action,
      target: opts.target || null,
      ipHash: opts.ipHash || null,
      meta: opts.meta ? JSON.stringify(opts.meta).slice(0, 5000) : null,
    });
  } catch (err) {
    console.error('[audit] log failed:', err);
  }
}
