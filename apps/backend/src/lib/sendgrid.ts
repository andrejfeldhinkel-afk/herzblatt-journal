/**
 * SendGrid-Integration (lightweight, über fetch — kein extra SDK-Dep).
 *
 * Funktionen:
 *   - addContactToList(email, firstName?, customFields?) → upsert contact + add to list
 *   - sendWelcomeEmail(email) → transactional welcome mail
 *   - bulkSyncContacts(emails) → für admin sync
 *
 * Aktiviert sich nur wenn SENDGRID_API_KEY gesetzt ist. Ohne Key: No-Op,
 * aber Rückgabe immer { ok: boolean, skipped?: true } damit Aufrufer klar sieht.
 *
 * Relevante ENV-Vars:
 *   SENDGRID_API_KEY           — API-Key (SG.xxx)
 *   SENDGRID_LIST_ID           — UUID der Zielliste (optional, sonst nur Contact)
 *   SENDGRID_FROM_EMAIL        — Absender (muss in SG verified sein)
 *   SENDGRID_FROM_NAME         — Absender-Name (default "Herzblatt Journal")
 *   SENDGRID_WELCOME_TEMPLATE_ID — dynamic template (optional, sonst plaintext)
 */

import { buildUnsubscribeToken } from '../routes/unsubscribe.js';

type SendGridResult = {
  ok: boolean;
  skipped?: boolean;
  status?: number;
  error?: string;
  data?: unknown;
};

const API_BASE = 'https://api.sendgrid.com/v3';

function getPublicBaseUrl(): string {
  // Public-URL für Unsubscribe-Links — Fallback: Production-Domain
  return (
    process.env.PUBLIC_BASE_URL ||
    process.env.APP_URL ||
    'https://herzblatt-journal.com'
  ).replace(/\/$/, '');
}

function buildUnsubscribeUrl(email: string): string {
  const token = buildUnsubscribeToken(email);
  // URL zeigt auf Frontend-Proxy (wir müssen noch einen bauen) oder direkt Backend
  // Variante: Frontend /api/unsubscribe?email=...&token=...
  return `${getPublicBaseUrl()}/api/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`;
}

function getConfig() {
  return {
    apiKey: process.env.SENDGRID_API_KEY || '',
    listId: process.env.SENDGRID_LIST_ID || '',
    fromEmail: process.env.SENDGRID_FROM_EMAIL || 'noreply@herzblatt-journal.com',
    fromName: process.env.SENDGRID_FROM_NAME || 'Herzblatt Journal',
    welcomeTemplateId: process.env.SENDGRID_WELCOME_TEMPLATE_ID || '',
  };
}

export function isSendGridEnabled(): boolean {
  return !!process.env.SENDGRID_API_KEY;
}

/**
 * Add email to SendGrid Marketing Contacts + (optional) zu einer Liste.
 * Idempotent: SG upsert'et, Duplikate kein Problem.
 */
export async function addContactToList(
  email: string,
  options?: { firstName?: string; source?: string },
): Promise<SendGridResult> {
  const cfg = getConfig();
  if (!cfg.apiKey) return { ok: true, skipped: true };

  try {
    const contact: Record<string, unknown> = { email };
    if (options?.firstName) contact.first_name = options.firstName;
    if (options?.source) {
      // SendGrid custom_fields brauchen field_id, daher als first_name-Fallback nicht gesetzt.
      // Source geht eher als list-Zuordnung rein.
    }

    const body: Record<string, unknown> = { contacts: [contact] };
    if (cfg.listId) body.list_ids = [cfg.listId];

    const res = await fetch(`${API_BASE}/marketing/contacts`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    // SG antwortet 202 Accepted + job_id für async processing
    const data = await res.json().catch(() => null);

    if (!res.ok) {
      return { ok: false, status: res.status, error: JSON.stringify(data) };
    }
    return { ok: true, status: res.status, data };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/**
 * Welcome-Mail an neuen Subscriber.
 * Wenn Template-ID gesetzt → dynamisches Template, sonst einfacher HTML-Content.
 */
export async function sendWelcomeEmail(email: string): Promise<SendGridResult> {
  const cfg = getConfig();
  if (!cfg.apiKey) return { ok: true, skipped: true };

  try {
    const personalization: Record<string, unknown> = {
      to: [{ email }],
    };

    const body: Record<string, unknown> = {
      from: { email: cfg.fromEmail, name: cfg.fromName },
      personalizations: [personalization],
    };

    const unsubUrl = buildUnsubscribeUrl(email);

    // Standard-Header für Abmeldung (RFC 8058) — erlaubt One-Click-Unsubscribe
    // in Gmail/Outlook-Interface
    body.headers = {
      'List-Unsubscribe': `<${unsubUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    };

    if (cfg.welcomeTemplateId) {
      body.template_id = cfg.welcomeTemplateId;
      personalization.dynamic_template_data = {
        email,
        first_name: email.split('@')[0],
        unsubscribe_url: unsubUrl,
      };
    } else {
      // Fallback: schlichter HTML-Content, wenn kein Template gesetzt
      body.subject = 'Willkommen im Herzblatt Journal 💕';
      body.content = [
        {
          type: 'text/plain',
          value: `Hallo!

Schön, dass du dich angemeldet hast. Du bekommst ab jetzt unsere besten Dating- und Beziehungs-Tipps direkt in dein Postfach.

Keine Spam-Mails, nur Gold-Content.

Herzlich,
Dein Herzblatt-Journal-Team

---
Abmelden jederzeit möglich: ${unsubUrl}
`,
        },
        {
          type: 'text/html',
          value: `
<!DOCTYPE html>
<html><body style="font-family: Georgia, serif; max-width: 600px; margin: 2rem auto; padding: 1rem; color: #333;">
  <h1 style="color: #e11d48;">Willkommen im Herzblatt Journal 💕</h1>
  <p>Schön, dass du dich angemeldet hast.</p>
  <p>Du bekommst ab jetzt unsere <strong>besten Dating- und Beziehungs-Tipps</strong> direkt in dein Postfach.</p>
  <p>Keine Spam-Mails, nur Gold-Content.</p>
  <p style="margin-top: 2rem;">Herzlich,<br>Dein Herzblatt-Journal-Team</p>
  <hr style="margin-top: 2rem; border: none; border-top: 1px solid #ddd;">
  <p style="font-size: 0.8rem; color: #888;">
    Du möchtest keine Mails mehr bekommen?
    <a href="${unsubUrl}" style="color: #888; text-decoration: underline;">Hier abmelden</a>.
  </p>
</body></html>
`,
        },
      ];
    }

    const res = await fetch(`${API_BASE}/mail/send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, status: res.status, error: text };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/**
 * Bulk-Sync für den Admin-/resync-Endpoint:
 * SendGrid contacts API akzeptiert bis zu 30000 contacts pro Call.
 * Wir chunken auf 1000 zur Sicherheit.
 */
export async function bulkSyncContacts(
  emails: string[],
): Promise<{ ok: boolean; totalSent: number; batches: number; errors: string[] }> {
  const cfg = getConfig();
  if (!cfg.apiKey) {
    return { ok: true, totalSent: 0, batches: 0, errors: ['skipped — no API key'] };
  }

  const BATCH_SIZE = 1000;
  let totalSent = 0;
  let batches = 0;
  const errors: string[] = [];

  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const chunk = emails.slice(i, i + BATCH_SIZE).map((email) => ({ email }));
    batches++;

    try {
      const body: Record<string, unknown> = { contacts: chunk };
      if (cfg.listId) body.list_ids = [cfg.listId];

      const res = await fetch(`${API_BASE}/marketing/contacts`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        errors.push(`batch ${batches}: ${res.status} ${text}`);
      } else {
        totalSent += chunk.length;
      }
    } catch (err) {
      errors.push(`batch ${batches}: ${String(err)}`);
    }
  }

  return { ok: errors.length === 0, totalSent, batches, errors };
}
