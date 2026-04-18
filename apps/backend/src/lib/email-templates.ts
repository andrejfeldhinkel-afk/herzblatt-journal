/**
 * Email-Templates für Herzblatt Journal.
 *
 * Anti-Spam-Design-Prinzipien:
 * - Keine Caps-Lock-Wörter, kein "KLICK HIER", "KOSTENLOS", "GRATIS"
 * - Max 1-2 Exclamation-Marks pro Mail
 * - Inline-CSS (Email-Clients strippen <style>)
 * - Max 600px Width (Standard)
 * - Text-Version IMMER beilegen (Plain-Text-Alternative)
 * - List-Unsubscribe + Unsub-Link in Footer (RFC 8058)
 * - Warme Typografie (Georgia-Serif für Wohlgefühl)
 * - Gedeckte Farben (keine knallroten Backgrounds die Spam-Filter triggern)
 * - Echte Content-Value > reines Promotion
 * - Max 3 Links pro Mail
 *
 * Variablen-Interpolation: {{variableName}} im HTML + Text.
 */

export interface EmailTemplate {
  id: string;
  name: string;
  description: string;
  category: 'transactional' | 'marketing';
  subject: string;              // kann {{vars}} enthalten
  preheader: string;            // preview-text in inbox-list
  variables: TemplateVariable[];
  previewData: Record<string, string>;
  render(data: Record<string, string>, ctx?: RenderContext): RenderedEmail;
}

export interface TemplateVariable {
  key: string;
  label: string;
  example: string;
}

export interface RenderContext {
  unsubscribeUrl?: string;
  webViewUrl?: string;
  baseUrl?: string;
}

export interface RenderedEmail {
  subject: string;
  preheader: string;
  html: string;
  text: string;
}

// ─── Shared building blocks ─────────────────────────────

const COLORS = {
  text: '#1f2937',
  textMuted: '#64748b',
  textDim: '#94a3b8',
  bg: '#ffffff',
  bgSoft: '#faf7f5',
  accent: '#e11d48',
  accentSoft: '#fdf2f4',
  border: '#e5e7eb',
};

function interpolate(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] ?? '');
}

/**
 * HTML-Frame — consistent Header + Footer für alle Mails.
 * Keep inline-styles everywhere. Keine `<style>` tags.
 */
function htmlFrame(opts: {
  preheader: string;
  bodyHtml: string;
  ctx: RenderContext;
}): string {
  const baseUrl = opts.ctx.baseUrl || 'https://herzblatt-journal.com';
  const unsubUrl = opts.ctx.unsubscribeUrl || '';
  const webViewUrl = opts.ctx.webViewUrl || '';

  return `<!DOCTYPE html>
<html lang="de" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>Herzblatt Journal</title>
</head>
<body style="margin:0; padding:0; background:#f5f2f0; font-family: Georgia, 'Times New Roman', serif; color: ${COLORS.text}; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
<!-- preheader (hidden, aber in Inbox-Preview sichtbar) -->
<div style="display:none; font-size:1px; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden; mso-hide:all; color:#f5f2f0;">${opts.preheader}</div>

<div style="background: #f5f2f0; padding: 32px 16px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" width="600" style="max-width: 600px; width: 100%; background: ${COLORS.bg}; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">

    <!-- Header -->
    <tr>
      <td style="padding: 32px 40px 16px 40px; text-align: left; border-bottom: 1px solid ${COLORS.border};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="vertical-align: middle;">
              <a href="${baseUrl}" style="text-decoration: none; color: ${COLORS.text};">
                <span style="font-size: 20px; font-weight: 700; letter-spacing: -0.02em; font-family: Georgia, serif;">Herzblatt Journal</span>
              </a>
            </td>
            <td style="vertical-align: middle; text-align: right;">
              <span style="font-size: 11px; color: ${COLORS.textDim}; text-transform: uppercase; letter-spacing: 0.15em;">Dating · Liebe · Beziehung</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Body -->
    <tr>
      <td style="padding: 32px 40px; font-size: 16px; line-height: 1.6; color: ${COLORS.text};">
${opts.bodyHtml}
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="padding: 24px 40px 32px; border-top: 1px solid ${COLORS.border}; background: ${COLORS.bgSoft}; border-radius: 0 0 12px 12px;">
        <p style="margin: 0 0 12px; font-size: 13px; color: ${COLORS.textMuted}; line-height: 1.5;">
          Du bekommst diese E-Mail weil du dich unter
          <a href="${baseUrl}" style="color: ${COLORS.textMuted}; text-decoration: underline;">herzblatt-journal.com</a>
          für unseren Newsletter angemeldet hast.
        </p>
        <p style="margin: 0 0 8px; font-size: 12px; color: ${COLORS.textDim};">
          ${webViewUrl ? `<a href="${webViewUrl}" style="color: ${COLORS.textDim}; text-decoration: underline;">Im Browser öffnen</a> · ` : ''}
          ${unsubUrl ? `<a href="${unsubUrl}" style="color: ${COLORS.textDim}; text-decoration: underline;">Abmelden</a>` : 'Abmelden: antworte auf diese Mail'}
        </p>
        <p style="margin: 12px 0 0; font-size: 11px; color: ${COLORS.textDim}; line-height: 1.5;">
          L-P GmbH · Ballindamm 27 · 20095 Hamburg · Deutschland<br>
          Verantwortlich: Andrej Feldhinkel · support@herzblatt-journal.de
        </p>
      </td>
    </tr>
  </table>
</div>
</body>
</html>`;
}

function textFrame(bodyText: string, unsubUrl?: string): string {
  return `${bodyText.trim()}

---
Herzblatt Journal · Dating, Liebe, Beziehung
${unsubUrl ? `Abmelden: ${unsubUrl}` : 'Abmelden: Antworte mit "ABMELDEN"'}

L-P GmbH · Ballindamm 27 · 20095 Hamburg · Deutschland
support@herzblatt-journal.de
`;
}

// ─── Template 1: Welcome ─────────────────────────────────

const welcomeTemplate: EmailTemplate = {
  id: 'welcome',
  name: 'Willkommens-Mail',
  description: 'Wird automatisch gesendet wenn jemand sich neu für den Newsletter anmeldet.',
  category: 'transactional',
  subject: 'Willkommen im Herzblatt Journal',
  preheader: 'Schön dass du dabei bist. Hier ist was du als nächstes erwarten kannst.',
  variables: [
    { key: 'first_name', label: 'Vorname (optional, Fallback: "")', example: '' },
  ],
  previewData: {
    first_name: '',
  },
  render(data, ctx = {}) {
    const greeting = data.first_name ? `Hallo ${data.first_name},` : 'Hallo,';
    const bodyHtml = `
<h1 style="font-family: Georgia, serif; font-size: 28px; font-weight: 700; letter-spacing: -0.02em; margin: 0 0 20px; color: ${COLORS.text}; line-height: 1.2;">
  ${greeting}
</h1>

<p style="margin: 0 0 20px;">
  schön dass du dabei bist. Ich freue mich wirklich dass du dem Herzblatt Journal vertraust.
</p>

<p style="margin: 0 0 20px;">
  Was dich erwartet — versprochen ehrlich:
</p>

<div style="background: ${COLORS.accentSoft}; border-left: 3px solid ${COLORS.accent}; padding: 20px 24px; margin: 0 0 28px; border-radius: 0 8px 8px 0;">
  <p style="margin: 0 0 10px; font-weight: 600; color: ${COLORS.text};">Alle 1-2 Wochen ein Brief</p>
  <p style="margin: 0; font-size: 15px; color: ${COLORS.textMuted}; line-height: 1.6;">
    Keine täglichen Sales. Kein Clickbait. Nur die Themen, bei denen sich eine Mail wirklich lohnt — Bindungsmuster verstehen, schwierige Gespräche führen, Trennungen durchstehen.
  </p>
</div>

<p style="margin: 0 0 20px;">
  Falls dich ein Thema gerade besonders beschäftigt — <a href="${ctx.baseUrl || 'https://herzblatt-journal.com'}/kontakt" style="color: ${COLORS.accent}; text-decoration: underline;">schreib mir einfach zurück</a>. Ich lese alle Antworten selber.
</p>

<p style="margin: 0 0 8px;">Herzlich,</p>
<p style="margin: 0; font-weight: 600; color: ${COLORS.text};">Sarah Kellner</p>
<p style="margin: 0 0 24px; font-size: 13px; color: ${COLORS.textMuted};">Chefredakteurin, Herzblatt Journal</p>

<hr style="border: none; border-top: 1px solid ${COLORS.border}; margin: 32px 0 24px;">

<p style="margin: 0 0 12px; font-size: 14px; color: ${COLORS.textMuted}; line-height: 1.5;">
  P.S. — In der nächsten Mail bekommst du unseren beliebtesten Artikel: wie man sichere Bindung nachträglich aufbaut. Wenn dich das Thema nicht interessiert, antworte einfach mit "skip" und ich schick dir was anderes.
</p>
`;
    const text = `${greeting}

schön dass du dabei bist. Ich freue mich wirklich dass du dem Herzblatt Journal vertraust.

Was dich erwartet — versprochen ehrlich:

Alle 1-2 Wochen ein Brief. Keine täglichen Sales. Kein Clickbait. Nur die Themen, bei denen sich eine Mail wirklich lohnt — Bindungsmuster verstehen, schwierige Gespräche führen, Trennungen durchstehen.

Falls dich ein Thema gerade besonders beschäftigt — schreib mir einfach zurück. Ich lese alle Antworten selber.

Herzlich,
Sarah Kellner
Chefredakteurin, Herzblatt Journal

P.S. — In der nächsten Mail bekommst du unseren beliebtesten Artikel: wie man sichere Bindung nachträglich aufbaut.`;

    return {
      subject: 'Willkommen im Herzblatt Journal',
      preheader: this.preheader,
      html: htmlFrame({ preheader: this.preheader, bodyHtml, ctx }),
      text: textFrame(text, ctx.unsubscribeUrl),
    };
  },
};

// ─── Template 2: Weekly Roundup ──────────────────────────

const weeklyRoundupTemplate: EmailTemplate = {
  id: 'weekly-roundup',
  name: 'Wöchentlicher Artikel-Überblick',
  description: 'Regelmäßiger Newsletter-Brief mit den besten 3-5 neuen Artikeln.',
  category: 'marketing',
  subject: '{{headline}} — Herzblatt Journal',
  preheader: '{{preheader_text}}',
  variables: [
    { key: 'headline', label: 'Subject-Zeile (Thema der Woche)', example: 'Diese Woche: Bindungsangst verstehen' },
    { key: 'preheader_text', label: 'Preview-Text in Inbox', example: '3 neue Artikel zu Bindung und Selbstwert.' },
    { key: 'intro', label: 'Persönliche Intro-Zeilen (2-3 Sätze)', example: 'In den letzten Tagen häufen sich bei uns Mails zum Thema Bindungsangst. Deshalb haben wir drei Perspektiven dazu zusammengestellt.' },
    { key: 'article1_title', label: 'Artikel 1 — Titel', example: 'Bindungsangst: Warum wir nahe Menschen auf Abstand halten' },
    { key: 'article1_excerpt', label: 'Artikel 1 — Anreißer (1-2 Sätze)', example: 'Nicht fehlende Liebe ist der Grund — sondern ein Schutzmechanismus den wir früh gelernt haben.' },
    { key: 'article1_url', label: 'Artikel 1 — URL', example: 'https://herzblatt-journal.com/blog/bindungsangst-grund' },
    { key: 'article2_title', label: 'Artikel 2 — Titel', example: 'Wenn Nähe sich wie Kontrolle anfühlt' },
    { key: 'article2_excerpt', label: 'Artikel 2 — Anreißer', example: 'Das Phänomen in einer neuen Beziehung — und wie man trotzdem Verbindung zulässt.' },
    { key: 'article2_url', label: 'Artikel 2 — URL', example: 'https://herzblatt-journal.com/blog/naehe-kontrolle' },
    { key: 'article3_title', label: 'Artikel 3 — Titel', example: 'Die Frage hinter der Frage: Was will ich eigentlich wirklich?' },
    { key: 'article3_excerpt', label: 'Artikel 3 — Anreißer', example: 'Eine Übung in 3 Schritten um eigene Bedürfnisse klarer zu bekommen.' },
    { key: 'article3_url', label: 'Artikel 3 — URL', example: 'https://herzblatt-journal.com/blog/eigene-beduerfnisse' },
  ],
  previewData: {
    headline: 'Diese Woche: Bindungsangst verstehen',
    preheader_text: '3 neue Artikel zu Bindung und Selbstwert.',
    intro: 'In den letzten Tagen häufen sich bei uns Mails zum Thema Bindungsangst. Deshalb haben wir drei Perspektiven dazu zusammengestellt.',
    article1_title: 'Bindungsangst: Warum wir nahe Menschen auf Abstand halten',
    article1_excerpt: 'Nicht fehlende Liebe ist der Grund — sondern ein Schutzmechanismus den wir früh gelernt haben.',
    article1_url: 'https://herzblatt-journal.com/blog/bindungsangst-grund',
    article2_title: 'Wenn Nähe sich wie Kontrolle anfühlt',
    article2_excerpt: 'Das Phänomen in einer neuen Beziehung — und wie man trotzdem Verbindung zulässt.',
    article2_url: 'https://herzblatt-journal.com/blog/naehe-kontrolle',
    article3_title: 'Die Frage hinter der Frage: Was will ich eigentlich wirklich?',
    article3_excerpt: 'Eine Übung in 3 Schritten um eigene Bedürfnisse klarer zu bekommen.',
    article3_url: 'https://herzblatt-journal.com/blog/eigene-beduerfnisse',
  },
  render(data, ctx = {}) {
    const subject = interpolate(this.subject, data);
    const preheader = interpolate(this.preheader, data);

    function articleBlock(title: string, excerpt: string, url: string, num: number): string {
      return `
<div style="padding: 20px 0; ${num > 1 ? `border-top: 1px solid ${COLORS.border};` : ''}">
  <p style="margin: 0 0 4px; font-size: 12px; color: ${COLORS.textDim}; text-transform: uppercase; letter-spacing: 0.12em; font-family: Georgia, serif;">Artikel ${num}</p>
  <h3 style="margin: 0 0 8px; font-family: Georgia, serif; font-size: 20px; font-weight: 700; letter-spacing: -0.01em; line-height: 1.3;">
    <a href="${url}" style="color: ${COLORS.text}; text-decoration: none;">${title}</a>
  </h3>
  <p style="margin: 0 0 12px; font-size: 15px; color: ${COLORS.textMuted}; line-height: 1.5;">
    ${excerpt}
  </p>
  <a href="${url}" style="display: inline-block; font-size: 14px; color: ${COLORS.accent}; text-decoration: none; font-weight: 500;">
    Weiterlesen →
  </a>
</div>`;
    }

    const bodyHtml = `
<p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6;">
  ${data.intro}
</p>

${articleBlock(data.article1_title, data.article1_excerpt, data.article1_url, 1)}
${articleBlock(data.article2_title, data.article2_excerpt, data.article2_url, 2)}
${articleBlock(data.article3_title, data.article3_excerpt, data.article3_url, 3)}

<p style="margin: 32px 0 0; font-size: 14px; color: ${COLORS.textMuted}; line-height: 1.5;">
  Wenn dich eins dieser Themen persönlich betrifft — schreib mir kurz wie's dir damit geht. Ich antworte.
</p>

<p style="margin: 20px 0 0; font-size: 14px; color: ${COLORS.text};">
  Bis bald,<br>
  <strong>Sarah</strong>
</p>
`;

    const text = `${data.intro}

---

ARTIKEL 1: ${data.article1_title}
${data.article1_excerpt}
${data.article1_url}

---

ARTIKEL 2: ${data.article2_title}
${data.article2_excerpt}
${data.article2_url}

---

ARTIKEL 3: ${data.article3_title}
${data.article3_excerpt}
${data.article3_url}

---

Wenn dich eins dieser Themen persönlich betrifft — schreib mir kurz wie's dir damit geht.

Bis bald,
Sarah`;

    return {
      subject,
      preheader,
      html: htmlFrame({ preheader, bodyHtml, ctx }),
      text: textFrame(text, ctx.unsubscribeUrl),
    };
  },
};

// ─── Template 3: E-Book Thanks (post-purchase) ──────────

const ebookThanksTemplate: EmailTemplate = {
  id: 'ebook-thanks',
  name: 'E-Book-Kauf-Bestätigung',
  description: 'Wird nach erfolgreichem E-Book-Kauf via Digistore24-Webhook ausgelöst.',
  category: 'transactional',
  subject: 'Dein Zugang zur Herzblatt-Methode',
  preheader: 'Dein Download-Link plus was in den nächsten Tagen kommt.',
  variables: [
    { key: 'first_name', label: 'Vorname', example: '' },
    { key: 'download_url', label: 'Download-Link zum E-Book', example: 'https://herzblatt-journal.com/download/ebook?token=...' },
    { key: 'order_id', label: 'Bestellnummer', example: 'DS24-ABC-12345' },
  ],
  previewData: {
    first_name: '',
    download_url: 'https://herzblatt-journal.com/download/ebook?token=sample',
    order_id: 'DS24-ABC-12345',
  },
  render(data, ctx = {}) {
    const greeting = data.first_name ? `Hallo ${data.first_name},` : 'Hallo,';
    const bodyHtml = `
<h1 style="font-family: Georgia, serif; font-size: 28px; font-weight: 700; margin: 0 0 20px; line-height: 1.2;">
  Willkommen zur Herzblatt-Methode.
</h1>

<p style="margin: 0 0 20px;">
  ${greeting} vielen Dank für dein Vertrauen. Dein Kauf ist bestätigt und der komplette Zugang steht für dich bereit.
</p>

<div style="background: ${COLORS.bgSoft}; border: 1px solid ${COLORS.border}; border-radius: 8px; padding: 24px; margin: 24px 0; text-align: center;">
  <p style="margin: 0 0 8px; font-size: 12px; color: ${COLORS.textDim}; text-transform: uppercase; letter-spacing: 0.1em;">Dein Download</p>
  <a href="${data.download_url}" style="display: inline-block; padding: 14px 28px; background: ${COLORS.accent}; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px; margin: 8px 0;">
    E-Book öffnen
  </a>
  <p style="margin: 12px 0 0; font-size: 12px; color: ${COLORS.textDim};">
    Bestell-Nr: ${data.order_id}
  </p>
</div>

<h2 style="font-family: Georgia, serif; font-size: 20px; font-weight: 700; margin: 32px 0 16px; letter-spacing: -0.01em;">
  Was in den nächsten Tagen kommt
</h2>

<p style="margin: 0 0 16px;">
  Über die nächsten 7 Tage bekommst du kurze Begleit-Mails — ich zeige dir Schritt für Schritt wie du am meisten aus der Methode rausholst. Kein Sales, nur Anwendung.
</p>

<ul style="margin: 0 0 20px; padding: 0 0 0 20px; font-size: 15px; line-height: 1.7; color: ${COLORS.text};">
  <li style="margin-bottom: 6px;">Tag 1: Deine erste Selbstreflexions-Übung</li>
  <li style="margin-bottom: 6px;">Tag 3: Die häufigsten Stolperstellen</li>
  <li style="margin-bottom: 6px;">Tag 7: Wie du das Gelernte stabil hältst</li>
</ul>

<p style="margin: 24px 0 0; font-size: 14px; color: ${COLORS.textMuted}; line-height: 1.6;">
  Wenn du irgendwo hängen bleibst — schreib mir einfach. Ich antworte persönlich innerhalb von 24 Stunden werktags.
</p>

<p style="margin: 24px 0 0;">
  Herzlich,<br>
  <strong>Sarah Kellner</strong>
</p>
`;
    const text = `${greeting}

vielen Dank für dein Vertrauen. Dein Kauf ist bestätigt.

DEIN DOWNLOAD:
${data.download_url}

Bestell-Nr: ${data.order_id}

WAS IN DEN NÄCHSTEN TAGEN KOMMT:
Über die nächsten 7 Tage bekommst du kurze Begleit-Mails — Schritt für Schritt wie du am meisten aus der Methode rausholst.
- Tag 1: Deine erste Selbstreflexions-Übung
- Tag 3: Die häufigsten Stolperstellen
- Tag 7: Wie du das Gelernte stabil hältst

Wenn du irgendwo hängen bleibst — schreib mir einfach. Ich antworte persönlich innerhalb von 24 Stunden werktags.

Herzlich,
Sarah Kellner`;

    return {
      subject: 'Dein Zugang zur Herzblatt-Methode',
      preheader: this.preheader,
      html: htmlFrame({ preheader: this.preheader, bodyHtml, ctx }),
      text: textFrame(text, ctx.unsubscribeUrl),
    };
  },
};

// ─── Template 4: Re-Engagement (dormant subs) ───────────

const reEngagementTemplate: EmailTemplate = {
  id: 're-engagement',
  name: 'Re-Engagement (schlafende Abonnenten)',
  description: 'Für Abonnenten die seit 60+ Tagen keine Mail geöffnet haben — ehrlich statt aggressiv.',
  category: 'marketing',
  subject: 'Lohnt es sich noch?',
  preheader: 'Kurze Frage: soll ich dir weiter schreiben — oder nicht?',
  variables: [
    { key: 'first_name', label: 'Vorname', example: '' },
  ],
  previewData: {
    first_name: '',
  },
  render(data, ctx = {}) {
    const greeting = data.first_name ? `Hallo ${data.first_name},` : 'Hallo,';
    const unsubUrl = ctx.unsubscribeUrl || '#';

    const bodyHtml = `
<h1 style="font-family: Georgia, serif; font-size: 26px; font-weight: 700; margin: 0 0 20px; line-height: 1.2;">
  Kurze ehrliche Frage.
</h1>

<p style="margin: 0 0 20px;">
  ${greeting} du hast dich mal für das Herzblatt Journal angemeldet — das ist jetzt ein Weilchen her, und mir ist aufgefallen dass du die letzten paar Mails nicht geöffnet hast.
</p>

<p style="margin: 0 0 20px;">
  Das ist absolut okay. Lebensphasen ändern sich, Themen verschieben sich. Ich will dir nicht lästig werden.
</p>

<p style="margin: 0 0 20px; font-weight: 600; color: ${COLORS.text};">
  Zwei Optionen — beide sind fair:
</p>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 24px 0;">
  <tr>
    <td align="center" style="padding: 4px;">
      <a href="${ctx.baseUrl || 'https://herzblatt-journal.com'}" style="display: inline-block; padding: 12px 24px; background: ${COLORS.accent}; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">
        Bleib dran
      </a>
    </td>
    <td align="center" style="padding: 4px;">
      <a href="${unsubUrl}" style="display: inline-block; padding: 12px 24px; background: ${COLORS.bgSoft}; color: ${COLORS.text}; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; border: 1px solid ${COLORS.border};">
        Abmelden
      </a>
    </td>
  </tr>
</table>

<p style="margin: 24px 0 0; font-size: 14px; color: ${COLORS.textMuted}; line-height: 1.6;">
  Wenn ich nichts von dir höre, nehme ich dich in 14 Tagen automatisch aus dem Verteiler. Keine weitere Aktion nötig — ich möchte deinen Posteingang nicht füllen wenn du die Inhalte gerade nicht brauchst.
</p>

<p style="margin: 24px 0 0;">
  Herzlich,<br>
  <strong>Sarah</strong>
</p>
`;

    const text = `${greeting}

du hast dich mal für das Herzblatt Journal angemeldet — das ist jetzt ein Weilchen her, und mir ist aufgefallen dass du die letzten paar Mails nicht geöffnet hast.

Das ist absolut okay. Lebensphasen ändern sich, Themen verschieben sich. Ich will dir nicht lästig werden.

ZWEI OPTIONEN — BEIDE SIND FAIR:
- Bleib dran: ${ctx.baseUrl || 'https://herzblatt-journal.com'}
- Abmelden: ${unsubUrl}

Wenn ich nichts von dir höre, nehme ich dich in 14 Tagen automatisch aus dem Verteiler.

Herzlich,
Sarah`;

    return {
      subject: 'Lohnt es sich noch?',
      preheader: this.preheader,
      html: htmlFrame({ preheader: this.preheader, bodyHtml, ctx }),
      text: textFrame(text, ctx.unsubscribeUrl),
    };
  },
};

// ─── Template 5: E-Book Promo (Sales-Mail) ──────────────

const ebookPromoTemplate: EmailTemplate = {
  id: 'ebook-promo',
  name: 'E-Book-Bewerbung (Sales-Mail)',
  description: 'Warm-geschriebene Verkaufs-Mail für die "Herzblatt-Methode". Persönliche Story → Mehrwert → sanfter CTA. Anti-Spam-Design (kein Caps, max 2 Links, echter Content-Wert vor Pitch).',
  category: 'marketing',
  subject: '{{subject_line}}',
  preheader: '{{preheader_text}}',
  variables: [
    { key: 'subject_line', label: 'Subject-Zeile', example: 'Was ich über sichere Bindung erst mit 34 verstanden habe' },
    { key: 'preheader_text', label: 'Preview-Text in Inbox (≤110 Zeichen)', example: 'Eine kurze persönliche Geschichte — und was daraus geworden ist.' },
    { key: 'first_name', label: 'Vorname (optional, Fallback: "")', example: '' },
    { key: 'hook_line', label: 'Opener-Zeile (emotionaler Haken, 1 Satz)', example: 'Ich wünschte, mir hätte das jemand mit 25 gesagt.' },
    { key: 'story_paragraph', label: 'Story-Absatz (4-6 Sätze, persönlich)', example: 'Jahrelang habe ich geglaubt, dass "zu viel" zu fühlen mein Problem ist. Dass ich weniger brauchen, weniger spüren, weniger fragen muss. Bis mir eine befreundete Therapeutin einen Satz sagte der alles verändert hat: Nicht deine Intensität ist das Problem — sondern dass du noch nie gelernt hast, dass sie willkommen ist. Von da an habe ich drei Jahre lang nur an einer Sache gearbeitet.' },
    { key: 'pain_heading', label: 'Überschrift Pain-Block', example: 'Vielleicht kennst du das:' },
    { key: 'pain_point_1', label: 'Pain-Point 1', example: 'Du liebst — aber eine Stimme fragt ständig "bin ich zu viel?"' },
    { key: 'pain_point_2', label: 'Pain-Point 2', example: 'Du wählst unbewusst immer wieder Menschen, die emotional nicht verfügbar sind.' },
    { key: 'pain_point_3', label: 'Pain-Point 3', example: 'Wenn es ernst wird, ziehst du dich zurück — oder klammerst.' },
    { key: 'promise_paragraph', label: 'Promise-Absatz (was gibt das E-Book)', example: 'Die Herzblatt-Methode ist kein weiteres Selbsthilfe-PDF. Es ist eine 90-seitige Arbeits-Anleitung, die dir in 4 Schritten zeigt wie sich sichere Bindung im Alltag anfühlt — mit 17 konkreten Übungen, die du heute Abend starten kannst. Keine Therapie-Abkürzung, aber ein klarer Einstiegspunkt.' },
    { key: 'ebook_url', label: 'Checkout-URL (tracking-parametrisiert)', example: 'https://www.digistore24.com/product/herzblatt-methode?source=newsletter' },
    { key: 'price_line', label: 'Preis-Info (menschlich formuliert)', example: 'Einmalig 89,99 € — einmalige Zahlung, lebenslanger Zugang + alle künftigen Updates.' },
    { key: 'testimonial_quote', label: 'Testimonial-Zitat (echter User)', example: 'Ich dachte ehrlich, es ist wieder so ein generisches Ding. Aber Übung 4 hat mich eine Nacht wach gehalten — auf die gute Art. Ich sehe meine Beziehungen anders.' },
    { key: 'testimonial_author', label: 'Testimonial-Autor', example: 'Jana, 31, München' },
    { key: 'pps_line', label: 'P.S.-Zeile (Risiko-Reversal oder persönliche Note)', example: '30 Tage Geld-zurück, bedingungslos. Wenn das Workbook dir nicht etwas Neues zeigt, schreib mir eine Mail und du bekommst alles zurück.' },
  ],
  previewData: {
    subject_line: 'Was ich über sichere Bindung erst mit 34 verstanden habe',
    preheader_text: 'Eine kurze persönliche Geschichte — und was daraus geworden ist.',
    first_name: '',
    hook_line: 'Ich wünschte, mir hätte das jemand mit 25 gesagt.',
    story_paragraph: 'Jahrelang habe ich geglaubt, dass "zu viel" zu fühlen mein Problem ist. Dass ich weniger brauchen, weniger spüren, weniger fragen muss. Bis mir eine befreundete Therapeutin einen Satz sagte der alles verändert hat: Nicht deine Intensität ist das Problem — sondern dass du noch nie gelernt hast, dass sie willkommen ist. Von da an habe ich drei Jahre lang nur an einer Sache gearbeitet.',
    pain_heading: 'Vielleicht kennst du das:',
    pain_point_1: 'Du liebst — aber eine Stimme fragt ständig "bin ich zu viel?"',
    pain_point_2: 'Du wählst unbewusst immer wieder Menschen, die emotional nicht verfügbar sind.',
    pain_point_3: 'Wenn es ernst wird, ziehst du dich zurück — oder klammerst.',
    promise_paragraph: 'Die Herzblatt-Methode ist kein weiteres Selbsthilfe-PDF. Es ist eine 90-seitige Arbeits-Anleitung, die dir in 4 Schritten zeigt wie sich sichere Bindung im Alltag anfühlt — mit 17 konkreten Übungen, die du heute Abend starten kannst. Keine Therapie-Abkürzung, aber ein klarer Einstiegspunkt.',
    ebook_url: 'https://www.digistore24.com/product/herzblatt-methode?source=newsletter',
    price_line: 'Einmalig 89,99 € — einmalige Zahlung, lebenslanger Zugang + alle künftigen Updates.',
    testimonial_quote: 'Ich dachte ehrlich, es ist wieder so ein generisches Ding. Aber Übung 4 hat mich eine Nacht wach gehalten — auf die gute Art. Ich sehe meine Beziehungen anders.',
    testimonial_author: 'Jana, 31, München',
    pps_line: '30 Tage Geld-zurück, bedingungslos. Wenn das Workbook dir nicht etwas Neues zeigt, schreib mir eine Mail und du bekommst alles zurück.',
  },
  render(data, ctx = {}) {
    const subject = interpolate(this.subject, data);
    const preheader = interpolate(this.preheader, data);
    const greeting = data.first_name ? `Hallo ${data.first_name},` : 'Hallo,';

    const bodyHtml = `
<h1 style="font-family: Georgia, serif; font-size: 26px; font-weight: 700; letter-spacing: -0.02em; margin: 0 0 20px; color: ${COLORS.text}; line-height: 1.25;">
  ${data.hook_line}
</h1>

<p style="margin: 0 0 16px; font-size: 16px; line-height: 1.65;">
  ${greeting}
</p>

<p style="margin: 0 0 22px; font-size: 16px; line-height: 1.7;">
  ${data.story_paragraph}
</p>

<p style="margin: 0 0 10px; font-weight: 600; color: ${COLORS.text}; font-size: 16px;">
  ${data.pain_heading}
</p>
<ul style="margin: 0 0 26px; padding: 0 0 0 20px; font-size: 15.5px; line-height: 1.7; color: ${COLORS.text};">
  <li style="margin-bottom: 8px;">${data.pain_point_1}</li>
  <li style="margin-bottom: 8px;">${data.pain_point_2}</li>
  <li style="margin-bottom: 8px;">${data.pain_point_3}</li>
</ul>

<div style="background: ${COLORS.accentSoft}; border-left: 3px solid ${COLORS.accent}; padding: 22px 26px; margin: 0 0 28px; border-radius: 0 8px 8px 0;">
  <p style="margin: 0 0 12px; font-weight: 600; color: ${COLORS.text}; font-size: 16px;">Was daraus geworden ist</p>
  <p style="margin: 0; font-size: 15px; color: ${COLORS.textMuted}; line-height: 1.65;">
    ${data.promise_paragraph}
  </p>
</div>

<!-- CTA -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 24px 0 20px;">
  <tr>
    <td align="center">
      <a href="${data.ebook_url}" style="display: inline-block; padding: 15px 34px; background: ${COLORS.accent}; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; letter-spacing: -0.01em;">
        Zum Workbook
      </a>
    </td>
  </tr>
</table>

<p style="margin: 0 0 28px; text-align: center; font-size: 13.5px; color: ${COLORS.textMuted};">
  ${data.price_line}
</p>

<!-- Testimonial -->
<div style="padding: 22px 26px; background: ${COLORS.bgSoft}; border: 1px solid ${COLORS.border}; border-radius: 10px; margin: 0 0 28px;">
  <p style="margin: 0 0 10px; font-size: 15.5px; line-height: 1.65; color: ${COLORS.text}; font-style: italic;">
    "${data.testimonial_quote}"
  </p>
  <p style="margin: 0; font-size: 13px; color: ${COLORS.textMuted};">
    — ${data.testimonial_author}
  </p>
</div>

<p style="margin: 24px 0 0; font-size: 15px;">
  Herzlich,<br>
  <strong>Sarah</strong>
</p>

<p style="margin: 28px 0 0; padding-top: 20px; border-top: 1px solid ${COLORS.border}; font-size: 13.5px; color: ${COLORS.textMuted}; line-height: 1.6;">
  <strong style="color: ${COLORS.text};">P.S.</strong> ${data.pps_line}
</p>
`;

    const text = `${data.hook_line}

${greeting}

${data.story_paragraph}

${data.pain_heading}
- ${data.pain_point_1}
- ${data.pain_point_2}
- ${data.pain_point_3}

WAS DARAUS GEWORDEN IST:
${data.promise_paragraph}

Zum Workbook: ${data.ebook_url}
${data.price_line}

---

"${data.testimonial_quote}"
— ${data.testimonial_author}

---

Herzlich,
Sarah

P.S. ${data.pps_line}`;

    return {
      subject,
      preheader,
      html: htmlFrame({ preheader, bodyHtml, ctx }),
      text: textFrame(text, ctx.unsubscribeUrl),
    };
  },
};

// ─── Registry ───────────────────────────────────────────

export const emailTemplates: EmailTemplate[] = [
  welcomeTemplate,
  weeklyRoundupTemplate,
  ebookPromoTemplate,
  ebookThanksTemplate,
  reEngagementTemplate,
];

export function getEmailTemplate(id: string): EmailTemplate | undefined {
  return emailTemplates.find((t) => t.id === id);
}

export function renderEmailTemplate(
  id: string,
  data: Record<string, string>,
  ctx: RenderContext = {},
): RenderedEmail | null {
  const tpl = getEmailTemplate(id);
  if (!tpl) return null;
  return tpl.render(data, ctx);
}
