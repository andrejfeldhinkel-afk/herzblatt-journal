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

// =====================================================================
// Drip-Kampagne nach Ebook-Kauf
// =====================================================================
//
// Die Scheduling-Logik lebt in routes/ebook-drip.ts / schema.ebookDripSchedule.
// Hier sind nur die drei konkreten Mail-Sende-Funktionen, die der Cron
// (/admin/cron/ebook-drip) pro fälliger Row aufruft.
//
// Alle drei nutzen denselben Absender + Unsubscribe-Header + HMAC-Zugangs-Link
// wie die Delivery-Mail. Wenn SENDGRID_*_DRIP_TEMPLATE_ID gesetzt ist, wird
// ein dynamisches Template genutzt; sonst rendern wir inline-HTML+Plaintext.
//
// Convention: Der Aufrufer (ebook-drip Cron) übergibt die bereits mit
// buildEbookAccessUrl() erzeugte Access-URL mit Deep-Link zum Lese-Bereich.

type DripStep = 'day1' | 'day7' | 'day30';

interface DripCopy {
  subject: string;
  heading: string;
  bodyHtml: string;     // HTML-Content zwischen heading und CTA-Button
  bodyText: string;     // Plaintext-Variante des Hauptbodys
  ctaLabel: string;
  deepLinkHash?: string; // Anker innerhalb /ebook/lesen (z.B. '#01-selbstkenntnis')
  templateIdEnv: string; // Name der ENV-Variable für SG-Template-ID
}

const DRIP_COPY: Record<DripStep, DripCopy> = {
  day1: {
    subject: 'Los geht\'s — Kapitel 1 wartet auf dich',
    heading: 'Hallo ${firstName}, bereit für Tag 1?',
    bodyHtml: `<p style="font-size:16px; line-height:1.65; margin:0 0 20px;">
      Du hast gestern die <strong>Herzblatt-Methode</strong> freigeschaltet.
      Damit du nicht von der Content-Menge erschlagen wirst: fang einfach
      mit <strong>Kapitel 1 — Selbstkenntnis</strong> an. 15 Minuten Lesezeit.
    </p>
    <p style="font-size:16px; line-height:1.65; margin:0 0 20px;">
      Die ersten Übungen klären eine unterschätzte Frage: <em>Was suchst du
      eigentlich wirklich in einer Beziehung?</em> Wer das nicht sauber
      beantworten kann, daten an den eigenen Bedürfnissen vorbei — oft
      jahrelang.
    </p>
    <p style="font-size:15px; line-height:1.65; margin:0 0 16px; color:#64748b;">
      Tipp: Nimm dir Stift und Papier dazu. Die Fragen am Ende des Kapitels
      funktionieren nur, wenn du sie handschriftlich beantwortest — das ist
      kein esoterischer Quatsch, sondern schlicht Neurobiologie.
    </p>`,
    bodyText: `Du hast gestern die Herzblatt-Methode freigeschaltet. Damit du nicht von der Content-Menge erschlagen wirst: fang einfach mit Kapitel 1 — Selbstkenntnis an. 15 Minuten Lesezeit.

Die ersten Übungen klären eine unterschätzte Frage: Was suchst du eigentlich wirklich in einer Beziehung? Wer das nicht sauber beantworten kann, daten an den eigenen Bedürfnissen vorbei — oft jahrelang.

Tipp: Nimm dir Stift und Papier dazu. Die Fragen am Ende des Kapitels funktionieren nur, wenn du sie handschriftlich beantwortest.`,
    ctaLabel: 'Kapitel 1 starten',
    deepLinkHash: '#01-selbstkenntnis',
    templateIdEnv: 'SENDGRID_DRIP_DAY1_TEMPLATE_ID',
  },
  day7: {
    subject: 'Woche 1 Check-in — die 3 wichtigsten Erkenntnisse',
    heading: 'Hallo ${firstName}, wie lief deine erste Woche?',
    bodyHtml: `<p style="font-size:16px; line-height:1.65; margin:0 0 20px;">
      Sieben Tage sind seit deinem Start vergangen. Egal ob du ein Kapitel
      pro Tag gelesen hast oder nur Kapitel 1 — hier sind die drei
      Erkenntnisse, die fast alle Leser als Game-Changer nennen:
    </p>
    <ol style="font-size:15px; line-height:1.8; margin:0 0 24px 20px; padding:0; color:#1f2937;">
      <li><strong>Dein Bindungsstil ist kein Schicksal.</strong> Kapitel 2 zeigt dir, warum 60% der Erwachsenen unsicher gebunden sind — und wie du das bei dir veränderst.</li>
      <li><strong>Red Flags sind oft leiser als du denkst.</strong> Kapitel 8 listet die 12 Warnsignale, die sich als "intensiv" oder "leidenschaftlich" verkleiden.</li>
      <li><strong>Die ersten 100 Tage entscheiden mehr als das erste Date.</strong> Kapitel 11 ist die Abkürzung durch die Phase, in der die meisten Beziehungen kippen.</li>
    </ol>
    <p style="font-size:15px; line-height:1.65; margin:0 0 16px; color:#64748b;">
      Wenn du diese Woche nichts gelesen hast — kein Drama. Das Buch wartet.
      Geh einfach jetzt rein und lies das Kapitel, das dich gerade am meisten
      anspricht. Kein Muss.
    </p>`,
    bodyText: `Sieben Tage sind seit deinem Start vergangen. Hier sind die drei Erkenntnisse, die fast alle Leser als Game-Changer nennen:

1. Dein Bindungsstil ist kein Schicksal. Kapitel 2 zeigt dir, warum 60% der Erwachsenen unsicher gebunden sind — und wie du das bei dir veränderst.

2. Red Flags sind oft leiser als du denkst. Kapitel 8 listet die 12 Warnsignale, die sich als "intensiv" oder "leidenschaftlich" verkleiden.

3. Die ersten 100 Tage entscheiden mehr als das erste Date. Kapitel 11 ist die Abkürzung durch die Phase, in der die meisten Beziehungen kippen.

Wenn du diese Woche nichts gelesen hast — kein Drama. Das Buch wartet.`,
    ctaLabel: 'Weiterlesen',
    deepLinkHash: '#02-bindungsstil',
    templateIdEnv: 'SENDGRID_DRIP_DAY7_TEMPLATE_ID',
  },
  day30: {
    subject: 'Zeit für deinen Check-In — wo stehst du nach 30 Tagen?',
    heading: 'Hallo ${firstName}, 30 Tage Herzblatt-Methode.',
    bodyHtml: `<p style="font-size:16px; line-height:1.65; margin:0 0 20px;">
      Vor einem Monat hast du die Methode gekauft. Wenn du die Kapitel
      durchgearbeitet hast: <strong>Respekt.</strong> Wenn nicht: auch okay.
      Das Material verschwindet nicht. Lebenslanger Zugang bedeutet genau das.
    </p>
    <p style="font-size:16px; line-height:1.65; margin:0 0 20px;">
      Zeit für einen ehrlichen Check-in. Öffne <strong>Kapitel 15 — Jährlicher
      Beziehungs-Check-In</strong> und beantworte die 7 Kernfragen. Alleine
      oder mit deinem Partner. Das Workbook (Bonus 1) hat dafür extra Seiten
      zum Ausdrucken.
    </p>
    <p style="font-size:15px; line-height:1.65; margin:0 0 16px;">
      Zwei Fragen für den Weg:
    </p>
    <ul style="font-size:15px; line-height:1.8; margin:0 0 24px 20px; padding:0; color:#1f2937;">
      <li>Was ist in deinem Dating-/Beziehungsleben in den letzten 30 Tagen anders als vorher?</li>
      <li>Welche EINE Übung aus dem Buch hast du noch nicht gemacht, die dich aber anspricht?</li>
    </ul>
    <p style="font-size:15px; line-height:1.65; margin:0 0 16px; color:#64748b;">
      Und wenn du magst — antworte einfach auf diese Mail und erzähl mir,
      was hängen geblieben ist. Ich lese jede Antwort.
    </p>`,
    bodyText: `Vor einem Monat hast du die Methode gekauft. Wenn du die Kapitel durchgearbeitet hast: Respekt. Wenn nicht: auch okay. Das Material verschwindet nicht.

Zeit für einen ehrlichen Check-in. Öffne Kapitel 15 — Jährlicher Beziehungs-Check-In und beantworte die 7 Kernfragen. Das Workbook (Bonus 1) hat dafür extra Seiten zum Ausdrucken.

Zwei Fragen für den Weg:
- Was ist in deinem Dating-/Beziehungsleben in den letzten 30 Tagen anders als vorher?
- Welche EINE Übung aus dem Buch hast du noch nicht gemacht, die dich aber anspricht?

Und wenn du magst — antworte einfach auf diese Mail.`,
    ctaLabel: 'Kapitel 15 öffnen',
    deepLinkHash: '#15-jaehrlicher-check-in',
    templateIdEnv: 'SENDGRID_DRIP_DAY30_TEMPLATE_ID',
  },
};

/**
 * Interne Helper-Funktion: baut das komplette HTML+Text für eine Drip-Mail
 * und sendet sie via SendGrid.
 *
 * @param step       'day1' | 'day7' | 'day30'
 * @param email      Empfänger (bereits normalisiert)
 * @param accessUrl  vom Aufrufer gebaute HMAC-Access-URL (deep-link-fähig)
 */
async function sendEbookDripEmail(
  step: DripStep,
  email: string,
  accessUrl: string,
): Promise<SendGridResult> {
  const cfg = getConfig();
  if (!cfg.apiKey) return { ok: true, skipped: true };
  if (!email || !accessUrl) return { ok: false, error: 'missing-email-or-url' };

  const copy = DRIP_COPY[step];
  if (!copy) return { ok: false, error: 'unknown-drip-step' };

  try {
    const templateId = process.env[copy.templateIdEnv] || '';
    const unsubUrl = buildUnsubscribeUrl(email);
    const firstName = email.split('@')[0];

    // Deep-Link an die Access-URL anhängen, wenn definiert.
    // buildEbookAccessUrl setzt keinen Hash, wir können ihn safe anhängen.
    const deepLink = copy.deepLinkHash ? `${accessUrl}${copy.deepLinkHash}` : accessUrl;

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

    if (templateId) {
      body.template_id = templateId;
      personalization.dynamic_template_data = {
        email,
        first_name: firstName,
        access_url: deepLink,
        cta_label: copy.ctaLabel,
        unsubscribe_url: unsubUrl,
        support_email: 'service@herzblatt-journal.com',
      };
    } else {
      // Inline-Rendering — ersetzt ${firstName} in heading/bodyHtml/bodyText.
      const heading = copy.heading.replace(/\$\{firstName\}/g, firstName);
      const bodyHtml = copy.bodyHtml.replace(/\$\{firstName\}/g, firstName);
      const bodyText = copy.bodyText.replace(/\$\{firstName\}/g, firstName);
      const supportEmail = 'service@herzblatt-journal.com';

      const html = `<!DOCTYPE html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${copy.subject}</title></head>
<body style="margin:0; padding:0; background:#faf7f5; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color:#1f2937;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf7f5;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.04);">
        <tr><td style="padding:40px 40px 24px;">
          <h1 style="font-family: Georgia, 'Times New Roman', serif; font-size:24px; font-weight:700; letter-spacing:-0.02em; margin:0 0 20px; color:#1f2937; line-height:1.25;">
            ${heading}
          </h1>
          ${bodyHtml}
          <div style="text-align:center; margin:28px 0 20px;">
            <a href="${deepLink}" style="display:inline-block; background:#e11d48; color:#ffffff; text-decoration:none; padding:14px 28px; border-radius:8px; font-weight:600; font-size:16px;">${copy.ctaLabel}</a>
          </div>
          <p style="margin:24px 0 4px;">Herzlich,</p>
          <p style="margin:0; font-weight:600; color:#1f2937;">Sarah Kellner</p>
          <p style="margin:0 0 0; font-size:13px; color:#64748b;">Chefredakteurin, Herzblatt Journal</p>
        </td></tr>
        <tr><td style="padding:20px 40px 28px; border-top:1px solid #e5e7eb;">
          <p style="margin:0 0 8px; font-size:12px; color:#94a3b8; line-height:1.5;">
            Zugang verloren? Auf <a href="https://herzblatt-journal.com/ebook/zugang" style="color:#64748b;">herzblatt-journal.com/ebook/zugang</a> kannst du dir einen neuen Link schicken lassen. Fragen? <a href="mailto:${supportEmail}" style="color:#64748b;">${supportEmail}</a>.
          </p>
          <p style="margin:0; font-size:12px; color:#94a3b8; line-height:1.5;">
            Diese Mail gehört zur Herzblatt-Methode-Lernreise (${step}).
            <a href="${unsubUrl}" style="color:#94a3b8;">Abmelden</a> · L-P GmbH · Ballindamm 27 · 20095 Hamburg
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

      const text = `${heading}

${bodyText}

→ ${copy.ctaLabel}: ${deepLink}

Herzlich,
Sarah Kellner
Chefredakteurin, Herzblatt Journal

---
Zugang verloren? https://herzblatt-journal.com/ebook/zugang
Fragen? ${supportEmail}
Abmelden: ${unsubUrl}
L-P GmbH · Ballindamm 27 · 20095 Hamburg`;

      body.subject = copy.subject;
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
 * Schedule-API für die Webhook-Handler: plant die drei Drip-Steps in der
 * DB (ebook_drip_schedule). Das eigentliche Senden macht der Cron.
 *
 * Diese drei Funktionen sind dünne Wrapper um `scheduleEbookDrip()` —
 * der Aufrufer kann entweder einzeln oder alle drei auf einmal planen.
 *
 * Idempotent: wenn die Row für (email, step) schon existiert, tut die
 * Funktion nichts. Wichtig, weil die Webhook-Handler Retries erhalten
 * können.
 */
export async function scheduleEbookDripDay1(email: string): Promise<{ ok: boolean; scheduled?: boolean; error?: string }> {
  return scheduleEbookDrip(email, 'day1', 1);
}
export async function scheduleEbookDripDay7(email: string): Promise<{ ok: boolean; scheduled?: boolean; error?: string }> {
  return scheduleEbookDrip(email, 'day7', 7);
}
export async function scheduleEbookDripDay30(email: string): Promise<{ ok: boolean; scheduled?: boolean; error?: string }> {
  return scheduleEbookDrip(email, 'day30', 30);
}

/**
 * Plant alle drei Drip-Steps in einem Aufruf — für Payment-Webhooks.
 * Failures einzelner Rows blocken nicht die anderen.
 */
export async function scheduleAllEbookDrips(email: string): Promise<void> {
  await Promise.all([
    scheduleEbookDripDay1(email).catch((err) => console.error('[drip] day1 schedule failed', err)),
    scheduleEbookDripDay7(email).catch((err) => console.error('[drip] day7 schedule failed', err)),
    scheduleEbookDripDay30(email).catch((err) => console.error('[drip] day30 schedule failed', err)),
  ]);
}

/**
 * Low-level Schedule: legt eine Row in ebook_drip_schedule an. Bei Konflikt
 * (UNIQUE(email, step)) kein Fehler — scheduled=false.
 */
async function scheduleEbookDrip(
  email: string,
  step: DripStep,
  daysFromNow: number,
): Promise<{ ok: boolean; scheduled?: boolean; error?: string }> {
  try {
    const normalized = email.toLowerCase().trim();
    if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return { ok: false, error: 'invalid-email' };
    }
    // Lazy import — damit sendgrid.ts ohne DB-Verbindung benutzbar bleibt
    // (Unit-Tests, Scripts). Zusätzlich umgeht es zirkuläre Imports.
    const { db, schema } = await import('../db/index.js');
    const scheduledFor = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
    const inserted = await db
      .insert(schema.ebookDripSchedule)
      .values({
        email: normalized,
        dripStep: step,
        scheduledFor,
      })
      .onConflictDoNothing({
        target: [schema.ebookDripSchedule.email, schema.ebookDripSchedule.dripStep],
      })
      .returning({ id: schema.ebookDripSchedule.id });
    return { ok: true, scheduled: inserted.length > 0 };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/**
 * Direkt-Send eines Drip-Steps — wird vom Cron-Handler aufgerufen.
 * Exponiert die interne Render-+Send-Logik.
 */
export async function sendEbookDripStep(
  step: DripStep,
  email: string,
  accessUrl: string,
): Promise<SendGridResult> {
  return sendEbookDripEmail(step, email, accessUrl);
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
