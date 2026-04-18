/**
 * Article-Templates für den /herzraum/artikel/neu-Generator.
 *
 * Jedes Template hat:
 *  - id: slug-safe Template-Identifier
 *  - name: angezeigter Name
 *  - description: was das Template gut macht
 *  - defaultFrontmatter: partial frontmatter (wird mit User-Input gemerged)
 *  - markdownSkeleton: Body mit Platzhaltern {{placeholder}}
 *  - recommendedTags: Vorschläge für Tag-Auswahl
 *  - placeholders: Liste der {{key}}-Platzhalter mit Label + Hint für das Formular
 *  - minWords: Minimum-Wortanzahl vor Publish (verhindert Thin Content)
 */

export interface TemplatePlaceholder {
  key: string;
  label: string;
  hint?: string;
  type: 'text' | 'textarea' | 'markdown';
  required?: boolean;
  default?: string;
}

export interface ArticleTemplate {
  id: string;
  name: string;
  description: string;
  defaultFrontmatter: Record<string, unknown>;
  markdownSkeleton: string;
  recommendedTags: string[];
  placeholders: TemplatePlaceholder[];
  minWords: number;
}

export const articleTemplates: ArticleTemplate[] = [
  {
    id: 'ratgeber',
    name: 'Ratgeber',
    description: 'Problem → Lösung → FAQ. Ideal für psychologische/zwischenmenschliche Themen.',
    defaultFrontmatter: {
      tags: ['ratgeber'],
      featured: false,
    },
    recommendedTags: ['psychologie', 'beziehung', 'selbstliebe', 'kommunikation', 'dating-tipps'],
    minWords: 1200,
    placeholders: [
      { key: 'hook', label: 'Opener (2-3 Sätze, warum der Leser hier landet)', type: 'textarea', required: true },
      { key: 'problem', label: 'Das Problem detailliert beschreiben', type: 'markdown', required: true, hint: 'Was fühlt der Leser gerade?' },
      { key: 'root_cause', label: 'Ursachen (warum entsteht das?)', type: 'markdown', required: true },
      { key: 'solution', label: 'Lösungsansatz (konkrete Schritte)', type: 'markdown', required: true, hint: 'Nummerierte Liste oder Abschnitte' },
      { key: 'practical_tips', label: '5-7 praktische Tipps', type: 'markdown', required: true },
      { key: 'when_help', label: 'Wann professionelle Hilfe holen?', type: 'markdown', required: false },
    ],
    markdownSkeleton: `{{hook}}

## Das Problem: {{problem_headline}}

{{problem}}

## Warum passiert das?

{{root_cause}}

## So kannst du das ändern

{{solution}}

## 5-7 praktische Tipps für den Alltag

{{practical_tips}}

## Wann solltest du professionelle Hilfe holen?

{{when_help}}

## Fazit

Die wichtigsten Take-aways zusammengefasst — und was du morgen konkret anders machen kannst.
`,
  },

  {
    id: 'test-bericht',
    name: 'Test-Bericht (Dating-App / Produkt)',
    description: 'Pro/Contra → Bewertung → Fazit. Für Reviews mit klarer Empfehlung.',
    defaultFrontmatter: {
      tags: ['test', 'review'],
      author: 'markus-hoffmann',
    },
    recommendedTags: ['review', 'test', 'dating-apps', 'online-dating', 'partnervermittlung'],
    minWords: 1500,
    placeholders: [
      { key: 'product_name', label: 'Produkt-/App-Name', type: 'text', required: true },
      { key: 'test_duration', label: 'Testzeitraum (z.B. "4 Wochen")', type: 'text', required: true },
      { key: 'verdict_short', label: 'Kurz-Fazit (1-2 Sätze)', type: 'textarea', required: true },
      { key: 'first_impression', label: 'Erster Eindruck', type: 'markdown', required: true },
      { key: 'features', label: 'Features im Detail', type: 'markdown', required: true },
      { key: 'pros', label: 'Vorteile (Bullet-Liste mit ✅)', type: 'markdown', required: true },
      { key: 'cons', label: 'Nachteile (Bullet-Liste mit ❌)', type: 'markdown', required: true },
      { key: 'pricing', label: 'Preismodell', type: 'markdown', required: true },
      { key: 'target_audience', label: 'Für wen geeignet?', type: 'markdown', required: true },
      { key: 'rating', label: 'Bewertung (z.B. 4.2/5)', type: 'text', required: true },
    ],
    markdownSkeleton: `**Kurz gesagt:** {{verdict_short}}

In diesem Test-Bericht habe ich **{{product_name}}** über **{{test_duration}}** intensiv genutzt. Hier sind meine ehrlichen Erfahrungen — ohne Werbung, ohne Schönfärberei.

## Erster Eindruck

{{first_impression}}

## Features im Detail

{{features}}

## Was gut ist

{{pros}}

## Was nicht gut ist

{{cons}}

## Preismodell

{{pricing}}

## Für wen ist das was?

{{target_audience}}

## Mein Urteil: {{rating}}

{{verdict_long}}

---

*Transparenz-Hinweis: Dieser Test ist unbezahlt und unabhängig. Es gibt keine bezahlte Partnerschaft mit dem Anbieter.*
`,
  },

  {
    id: 'listicle',
    name: 'Listicle (7-10 Punkte)',
    description: 'Intro → nummerierte Liste → Outro. Funktioniert gut für SEO und Social Shares.',
    defaultFrontmatter: {
      tags: ['tipps', 'ratgeber'],
    },
    recommendedTags: ['tipps', 'ratgeber', 'dating-tipps', 'beziehung', 'selbstliebe'],
    minWords: 1000,
    placeholders: [
      { key: 'intro', label: 'Intro (warum diese Liste?)', type: 'textarea', required: true },
      { key: 'count', label: 'Wie viele Punkte? (7-10 empfohlen)', type: 'text', required: true, default: '7' },
      { key: 'list_items', label: 'Die Liste — pro Punkt: ### Überschrift + Erklärung', type: 'markdown', required: true, hint: 'Markdown-Format:\n### 1. Erster Punkt\nBeschreibung...\n### 2. Zweiter Punkt\n...' },
      { key: 'outro', label: 'Outro / Zusammenfassung', type: 'markdown', required: true },
    ],
    markdownSkeleton: `{{intro}}

{{list_items}}

## Zusammenfassung

{{outro}}

Welcher Punkt hat dich am meisten überrascht? Probier einen davon diese Woche aus — und beobachte, was sich verändert.
`,
  },

  {
    id: 'interview',
    name: 'Experten-Interview',
    description: 'Vorstellung → Q&A → Take-aways. Für Gespräche mit Therapeut:innen / Coaches.',
    defaultFrontmatter: {
      tags: ['interview', 'experte'],
    },
    recommendedTags: ['interview', 'experte', 'psychologie', 'beziehung', 'therapie'],
    minWords: 1400,
    placeholders: [
      { key: 'interviewee_name', label: 'Name Interviewpartner:in', type: 'text', required: true },
      { key: 'interviewee_role', label: 'Rolle / Qualifikation', type: 'text', required: true, hint: 'z.B. "Psychologin (M.Sc.), Paartherapeutin (DGVT)"' },
      { key: 'interviewee_intro', label: 'Vorstellung (1 Absatz)', type: 'textarea', required: true },
      { key: 'topic', label: 'Thema des Interviews', type: 'text', required: true },
      { key: 'qa_pairs', label: 'Q&A-Paare', type: 'markdown', required: true, hint: 'Format:\n**Q:** Frage...\n\nA: Antwort...' },
      { key: 'takeaways', label: '3-5 Take-aways', type: 'markdown', required: true, hint: 'Bullet-Liste' },
    ],
    markdownSkeleton: `## Die Interviewpartner:in

**{{interviewee_name}}** — {{interviewee_role}}

{{interviewee_intro}}

Heute sprechen wir über **{{topic}}** — und warum es so viele Menschen betrifft.

## Das Interview

{{qa_pairs}}

## Take-aways aus dem Gespräch

{{takeaways}}

---

*Dieses Interview wurde redaktionell gekürzt und für bessere Lesbarkeit überarbeitet.*
`,
  },

  {
    id: 'local-dating',
    name: 'Local Dating (Stadt-Guide)',
    description: 'Stadt → Locations → Dating-Tipps. Für lokale Suchanfragen wie "Dating in Berlin".',
    defaultFrontmatter: {
      tags: ['dating', 'lokal'],
    },
    recommendedTags: ['dating', 'lokal', 'date-ideen', 'städte-guide'],
    minWords: 1300,
    placeholders: [
      { key: 'city', label: 'Stadt', type: 'text', required: true },
      { key: 'city_vibe', label: 'Vibe der Stadt (1-2 Sätze zur Dating-Kultur)', type: 'textarea', required: true },
      { key: 'date_locations', label: 'Top-Location-Ideen für Dates', type: 'markdown', required: true, hint: '### Location-Name\nWo, warum gut fürs Date, Preis-Range' },
      { key: 'dating_apps_local', label: 'Welche Dating-Apps funktionieren hier gut?', type: 'markdown', required: true },
      { key: 'events', label: 'Events / Meetups zum Leute kennenlernen', type: 'markdown', required: false },
      { key: 'practical_tips', label: 'Praktische Tipps (ÖPNV, Verabredung, Kulturelles)', type: 'markdown', required: true },
    ],
    markdownSkeleton: `{{city}} ist anders. {{city_vibe}}

Wenn du in **{{city}}** nach Liebe suchst — oder einfach nur nach dem richtigen Rahmen fürs erste Date — hier ist mein kompletter Guide.

## Die besten Date-Locations in {{city}}

{{date_locations}}

## Welche Dating-Apps funktionieren in {{city}}?

{{dating_apps_local}}

## Events & Meetups: Menschen kennenlernen ohne App

{{events}}

## Praktische Tipps für Dates in {{city}}

{{practical_tips}}

## Fazit

{{city}} macht Dating {{easier_or_harder}} als andere Städte — und hier ist die Quintessenz, was du mitnehmen solltest.
`,
  },
];

/**
 * Findet ein Template nach ID.
 */
export function getTemplate(id: string): ArticleTemplate | undefined {
  return articleTemplates.find((t) => t.id === id);
}

/**
 * Füllt den Template-Skeleton mit User-Input.
 * Fehlende Keys bleiben als {{key}} stehen (für Autor sichtbar, dass noch was fehlt).
 */
export function renderTemplate(template: ArticleTemplate, values: Record<string, string>): string {
  let out = template.markdownSkeleton;
  for (const [key, val] of Object.entries(values)) {
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    out = out.replace(pattern, val || '');
  }
  return out;
}

/**
 * Validation: prüft ob alle required-Placeholders ausgefüllt sind.
 */
export function validateTemplate(
  template: ArticleTemplate,
  values: Record<string, string>,
): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  for (const p of template.placeholders) {
    if (p.required && !(values[p.key] && values[p.key].trim().length > 0)) {
      missing.push(p.label);
    }
  }
  return { ok: missing.length === 0, missing };
}
