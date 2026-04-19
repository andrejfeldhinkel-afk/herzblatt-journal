/**
 * SendGrid-Integration (lightweight, über fetch — kein extra SDK-Dep).
 *
 * Funktionen:
 *   - addContactToList(email, firstName?, customFields?) → upsert contact + add to list
 *   - sendWelcomeEmail(email) → transactional welcome mail
 *   - sendEbookDeliveryEmail(email, accessUrl) → Ebook-Zugangs-Mail nach Kauf
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
 *   SENDGRID_EBOOK_TEMPLATE_ID — dynamic template für Ebook-Delivery (optional)
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
      // SG-dynamic-template-Mode
      body.template_id = cfg.welcomeTemplateId;
      personalization.dynamic_template_data = {
        email,
        first_name: email.split('@')[0],
        unsubscribe_url: unsubUrl,
      };
    } else {
      // Code-Template aus email-templates.ts nutzen (schön designed, anti-spam)
      const { renderEmailTemplate } = await import('./email-templates.js');
      const baseUrl = process.env.PUBLIC_BASE_URL || 'https://herzblatt-journal.com';
      const rendered = renderEmailTemplate('welcome', { first_name: '' }, {
        baseUrl,
        unsubscribeUrl: unsubUrl,
      });
      if (rendered) {
        body.subject = rendered.subject;
        body.content = [
          { type: 'text/plain', value: rendered.text },
          { type: 'text/html', value: rendered.html },
        ];
      } else {
        // Ultra-fallback
        body.subject = 'Willkommen im Herzblatt Journal';
        body.content = [
          { type: 'text/plain', value: `Willkommen — schön dass du dabei bist.\n\nAbmelden: ${unsubUrl}` },
        ];
      }
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
 * Ebook-Delivery-Email: Sendet nach erfolgreichem Kauf den Zugangs-Link an
 * den Käufer. Wird von den Payment-Webhooks fire-and-forget getriggert +
 * vom Recovery-Endpoint (`POST /api/ebook/request-access`).
 *
 * @param email       Käufer-Email (bereits lowercased+trimmed erwartet)
 * @param accessUrl   Fertig gebaute Zugriffs-URL mit Token+Email-Params.
 *                    Erzeugt von lib/ebook-access.ts.buildEbookAccessUrl().
 */
export async function sendEbookDeliveryEmail(
  email: string,
  accessUrl: string,
): Promise<SendGridResult> {
  const cfg = getConfig();
  if (!cfg.apiKey) return { ok: true, skipped: true };
  if (!email || !accessUrl) return { ok: false, error: 'missing-email-or-url' };

  try {
    const ebookTemplateId = process.env.SENDGRID_EBOOK_TEMPLATE_ID || '';
    const unsubUrl = buildUnsubscribeUrl(email);

    const personalization: Record<string, unknown> = {
      to: [{ email }],
    };

    const body: Record<string, unknown> = {
      from: { email: cfg.fromEmail, name: cfg.fromName },
      personalizations: [personalization],
      headers: {
        'List-Unsubscribe': `<${unsubUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    };

    if (ebookTemplateId) {
      // Dynamic Template: Template-Owner definiert Layout in SG-Dashboard
      body.template_id = ebookTemplateId;
      personalization.dynamic_template_data = {
        email,
        first_name: email.split('@')[0],
        access_url: accessUrl,
        unsubscribe_url: unsubUrl,
        support_email: 'service@herzblatt-journal.com',
      };
    } else {
      // Plain-Fallback: selbst gerendertes HTML (warm, personal, auf den Punkt)
      const subject = 'Deine Herzblatt-Methode ist da 📕';
      const firstName = email.split('@')[0];
      const supportEmail = 'service@herzblatt-journal.com';

      const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Deine Herzblatt-Methode</title>
</head>
<body style="margin:0; padding:0; background:#faf7f5; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color:#1f2937;">
  <div style="display:none; font-size:1px; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden;">
    Dein Zugang zum Hauptbuch, Workbook und allen Bonus-Materialien.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf7f5;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.04);">
        <tr><td style="padding:40px 40px 24px;">
          <h1 style="font-family: Georgia, 'Times New Roman', serif; font-size:28px; font-weight:700; letter-spacing:-0.02em; margin:0 0 20px; color:#1f2937; line-height:1.2;">
            Hallo ${firstName},
          </h1>
          <p style="font-size:16px; line-height:1.65; margin:0 0 20px;">
            schön, dass du dich für die <strong>Herzblatt-Methode</strong> entschieden hast. Dein Zugang ist ab sofort freigeschaltet — lebenslang.
          </p>
          <div style="background:#fdf2f4; border-left:3px solid #e11d48; padding:20px 24px; margin:0 0 28px; border-radius:0 8px 8px 0;">
            <p style="margin:0 0 12px; font-weight:600; color:#1f2937; font-size:15px;">Hier geht's direkt zu deinen Inhalten:</p>
            <p style="margin:0 0 16px;">
              <a href="${accessUrl}" style="display:inline-block; background:#e11d48; color:#ffffff; text-decoration:none; padding:14px 28px; border-radius:8px; font-weight:600; font-size:16px;">Jetzt lesen</a>
            </p>
            <p style="margin:0; font-size:13px; color:#64748b;">
              Der Link ist persönlich für dich — bitte nicht weitergeben.
            </p>
          </div>
          <p style="font-size:16px; line-height:1.65; margin:0 0 16px;">
            Du bekommst sofortigen Zugang zu:
          </p>
          <ul style="font-size:15px; line-height:1.8; margin:0 0 24px 20px; padding:0; color:#1f2937;">
            <li><strong>15 Hauptkapitel</strong> — von Selbstkenntnis bis zum jährlichen Beziehungs-Check-In</li>
            <li><strong>Bonus 1:</strong> 80-Seiten-Workbook mit Übungen</li>
            <li><strong>Bonus 2:</strong> 30 erprobte Nachrichten-Vorlagen</li>
            <li><strong>Bonus 3:</strong> Red-Flag-Checkliste (druckfertig)</li>
            <li><strong>Bonus 4:</strong> Premium-Bindungsstil-Test</li>
            <li><strong>Bonus 5:</strong> Lebenslange Updates</li>
          </ul>
          <p style="font-size:15px; line-height:1.65; margin:0 0 16px; color:#64748b;">
            Fang an, wo es dich am meisten ruft. Die Kapitel funktionieren unabhängig voneinander — du musst nicht vorne anfangen. Wer tief einsteigen will, nimmt sich das Workbook dazu und arbeitet ein Kapitel pro Woche.
          </p>
          <p style="font-size:15px; line-height:1.65; margin:0 0 8px;">
            Wenn etwas nicht funktioniert oder du Fragen hast — antworte einfach auf diese Mail oder schreib an <a href="mailto:${supportEmail}" style="color:#e11d48; text-decoration:underline;">${supportEmail}</a>. Wir lesen jede Nachricht.
          </p>
          <p style="margin:24px 0 4px;">Herzlich,</p>
          <p style="margin:0; font-weight:600; color:#1f2937;">Sarah Kellner</p>
          <p style="margin:0 0 0; font-size:13px; color:#64748b;">Chefredakteurin, Herzblatt Journal</p>
        </td></tr>
        <tr><td style="padding:24px 40px 32px; border-top:1px solid #e5e7eb;">
          <p style="margin:0 0 8px; font-size:12px; color:#94a3b8; line-height:1.5;">
            Zugang verloren? Auf <a href="https://herzblatt-journal.com/ebook/zugang" style="color:#64748b;">herzblatt-journal.com/ebook/zugang</a> kannst du dir jederzeit einen neuen Zugangs-Link schicken lassen.
          </p>
          <p style="margin:0; font-size:12px; color:#94a3b8; line-height:1.5;">
            Diese Mail kam weil du die Herzblatt-Methode gekauft hast. Kein Newsletter-Opt-In nötig.
            <a href="${unsubUrl}" style="color:#94a3b8;">Abmelden</a> · L-P GmbH · Ballindamm 27 · 20095 Hamburg
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

      const text = `Hallo ${firstName},

schön, dass du dich für die Herzblatt-Methode entschieden hast. Dein Zugang ist ab sofort freigeschaltet — lebenslang.

Hier geht's direkt zu deinen Inhalten:
${accessUrl}

Du bekommst sofortigen Zugang zu:
- 15 Hauptkapitel — von Selbstkenntnis bis zum jährlichen Beziehungs-Check-In
- Bonus 1: 80-Seiten-Workbook mit Übungen
- Bonus 2: 30 erprobte Nachrichten-Vorlagen
- Bonus 3: Red-Flag-Checkliste (druckfertig)
- Bonus 4: Premium-Bindungsstil-Test
- Bonus 5: Lebenslange Updates

Fang an, wo es dich am meisten ruft. Die Kapitel funktionieren unabhängig voneinander.

Wenn etwas nicht funktioniert oder du Fragen hast — antworte einfach auf diese Mail oder schreib an ${supportEmail}.

Herzlich,
Sarah Kellner
Chefredakteurin, Herzblatt Journal

---
Zugang verloren? https://herzblatt-journal.com/ebook/zugang
Abmelden: ${unsubUrl}
L-P GmbH · Ballindamm 27 · 20095 Hamburg`;

      body.subject = subject;
      body.content = [
        { type: 'text/plain', value: text },
        { type: 'text/html', value: html },
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
      const t = await res.text().catch(() => '');
      return { ok: false, status: res.status, error: t };
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
