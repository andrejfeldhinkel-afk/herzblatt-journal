#!/usr/bin/env node
/**
 * auto-internal-links.mjs
 *
 * Ergänzt Blog-Artikel mit wenig internen Links (<3) automatisch um eine
 * "Weiterführende Artikel"-Sektion mit 3 verwandten Artikeln.
 *
 * Relatedness-Score:
 *   - tag-overlap (gewichtet, 3x)
 *   - slug-word-overlap (1x) — gemeinsame Wörter im Slug
 *   - Mindestens 1 Tag-Match PFLICHT
 *
 * Safety:
 *   - Idempotent: wenn Abschnitt `## Weiterführende Artikel` bereits existiert → skip
 *   - Kein Self-Link
 *   - Kein Duplikat (kein Ziel, das bereits im Artikel verlinkt ist)
 *   - Nur existierende Artikel werden gelinkt
 *   - Nur Artikel mit <3 internen Links werden angefasst
 *   - Artikel mit >5 existing links werden übersprungen
 *
 * Usage:
 *   node scripts/auto-internal-links.mjs
 *   node scripts/auto-internal-links.mjs --dry
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BLOG_DIR = path.join(ROOT, 'apps/frontend/src/content/blog');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry');
const MIN_LINKS_THRESHOLD = 3;
const SKIP_IF_MORE_THAN = 5; // Artikel mit >5 existing links anfassen wir nicht
const TOP_N = 3;

// Match /blog/<slug>
const LINK_RE = /(?:https?:\/\/herzblatt-journal\.com)?\/blog\/([a-z0-9-]+)(?:\/|#|\?|\))/gi;

// Stopwörter, die beim Slug-Wort-Vergleich ignoriert werden
const STOP_WORDS = new Set([
  'der', 'die', 'das', 'den', 'dem', 'ein', 'eine', 'einen', 'einem', 'einer',
  'und', 'oder', 'aber', 'als', 'wie', 'wo', 'was', 'wer', 'ist', 'sind', 'war',
  'mit', 'von', 'zu', 'zum', 'zur', 'fur', 'auf', 'an', 'in', 'im', 'bei',
  'guide', 'komplett', 'tipps', 'test', 'erfahrungen', 'beispiele',
  'so', 'nicht', 'kein', 'keine', 'mehr', 'auch', 'dein', 'deine',
  'ueber', 'uber', 'nach', 'vor', 'aus', 'um', 'hat', 'hast', 'sein', 'haben',
]);

function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { fm: {}, body: raw, fmRaw: '' };

  const fm = {};
  const lines = m[1].split(/\r?\n/);
  let currentKey = null;
  let currentList = null;

  for (const line of lines) {
    // List item under current key:  - "value"  or  - value
    const listMatch = line.match(/^\s+-\s+(.*)$/);
    if (listMatch && currentList) {
      let v = listMatch[1].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      currentList.push(v);
      continue;
    }

    // Top-level key
    const kv = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
    if (kv) {
      currentKey = kv[1];
      let v = kv[2].trim();
      if (v === '') {
        // List follows (block-style YAML list)
        fm[currentKey] = [];
        currentList = fm[currentKey];
      } else if (v.startsWith('[') && v.endsWith(']')) {
        // Inline YAML array: [a, b, "c", 'd']
        const inner = v.slice(1, -1).trim();
        if (inner === '') {
          fm[currentKey] = [];
        } else {
          fm[currentKey] = inner.split(',').map((it) => {
            let s = it.trim();
            if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
              s = s.slice(1, -1);
            }
            return s;
          }).filter(Boolean);
        }
        currentList = null;
      } else {
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        fm[currentKey] = v;
        currentList = null;
      }
    }
  }

  return { fm, body: m[2], fmRaw: m[1] };
}

function extractInternalLinks(body, ownSlug) {
  const found = new Set();
  let m;
  LINK_RE.lastIndex = 0;
  while ((m = LINK_RE.exec(body)) !== null) {
    const slug = m[1].toLowerCase();
    if (slug !== ownSlug) found.add(slug);
  }
  return found;
}

function slugWords(slug) {
  return slug
    .split('-')
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

function normalizeTag(tag) {
  return String(tag).toLowerCase().trim();
}

function main() {
  if (!fs.existsSync(BLOG_DIR)) {
    console.error(`[auto-internal-links] Blog dir not found: ${BLOG_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(BLOG_DIR).filter((f) => f.endsWith('.md'));

  // 1. Parse alle Artikel
  const articles = new Map(); // slug -> { slug, title, tags, body, linkCount, linkedSlugs, raw, fmRaw }
  for (const file of files) {
    const slug = file.replace(/\.md$/, '').toLowerCase();
    const full = path.join(BLOG_DIR, file);
    const raw = fs.readFileSync(full, 'utf8');
    const { fm, body, fmRaw } = parseFrontmatter(raw);
    if (fm.draft === 'true' || fm.draft === true) continue;

    const tags = Array.isArray(fm.tags) ? fm.tags.map(normalizeTag) : [];
    const links = extractInternalLinks(body, slug);

    articles.set(slug, {
      slug,
      file,
      title: fm.title || slug,
      tags,
      body,
      raw,
      fmRaw,
      linkCount: links.size,
      linkedSlugs: links,
      words: new Set(slugWords(slug)),
    });
  }

  // 2. Finde alle Kandidaten (<3 internal links)
  const lowLinkSlugs = [];
  for (const [slug, a] of articles) {
    if (a.linkCount < MIN_LINKS_THRESHOLD) lowLinkSlugs.push(slug);
  }

  console.log(`[auto-internal-links] Gefunden: ${lowLinkSlugs.length} Artikel mit <${MIN_LINKS_THRESHOLD} internen Links.`);

  // 3. Für jeden Low-Link-Artikel Top-N verwandte finden und einfügen
  let modified = 0;
  let skippedAlreadyHasSection = 0;
  let skippedTooManyLinks = 0;
  let skippedNoRelated = 0;
  let totalNewLinks = 0;
  const samples = [];

  for (const slug of lowLinkSlugs) {
    const self = articles.get(slug);

    // Safety: Artikel mit >5 existing links anfassen wir nicht
    if (self.linkCount > SKIP_IF_MORE_THAN) {
      skippedTooManyLinks++;
      continue;
    }

    // Idempotenz-Check: existiert Sektion bereits?
    if (/^## Weiterführende Artikel\s*$/m.test(self.body)) {
      skippedAlreadyHasSection++;
      continue;
    }

    // Related-Score berechnen
    const candidates = [];
    for (const [otherSlug, other] of articles) {
      if (otherSlug === slug) continue;
      if (self.linkedSlugs.has(otherSlug)) continue; // bereits verlinkt

      // Tag-Overlap
      const tagOverlap = other.tags.filter((t) => self.tags.includes(t)).length;
      if (tagOverlap < 1) continue; // mindestens 1 Tag-Match Pflicht

      // Slug-Word-Overlap
      let slugOverlap = 0;
      for (const w of self.words) {
        if (other.words.has(w)) slugOverlap++;
      }

      const score = tagOverlap * 3 + slugOverlap;
      candidates.push({ slug: otherSlug, title: other.title, score, tagOverlap, slugOverlap });
    }

    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Tiebreaker: bevorzuge Artikel mit mehr Slug-Word-Overlap, dann alphabetisch
      if (b.slugOverlap !== a.slugOverlap) return b.slugOverlap - a.slugOverlap;
      return a.slug.localeCompare(b.slug);
    });

    const top = candidates.slice(0, TOP_N);
    if (top.length === 0) {
      skippedNoRelated++;
      continue;
    }

    // Sanity-Check: Zielartikel MUSS existieren (file exists)
    const validTop = top.filter((c) => {
      const filePath = path.join(BLOG_DIR, `${c.slug}.md`);
      return fs.existsSync(filePath);
    });

    if (validTop.length === 0) {
      skippedNoRelated++;
      continue;
    }

    // Section aufbauen
    const sectionLines = [
      '',
      '## Weiterführende Artikel',
      '',
    ];
    for (const c of validTop) {
      sectionLines.push(`- [${c.title}](/blog/${c.slug})`);
    }
    sectionLines.push('');

    const section = sectionLines.join('\n');

    // Am Ende des Bodys anhängen (vor letztem <!-- -->-Kommentar wenn vorhanden)
    let newBody;
    const lastCommentMatch = self.body.match(/<!--[\s\S]*?-->\s*$/);
    if (lastCommentMatch) {
      const idx = self.body.lastIndexOf(lastCommentMatch[0]);
      newBody = self.body.slice(0, idx).replace(/\s+$/, '') + '\n' + section + '\n' + self.body.slice(idx);
    } else {
      newBody = self.body.replace(/\s+$/, '') + '\n' + section;
    }

    // Neuen Artikel zusammenbauen
    const newRaw = `---\n${self.fmRaw}\n---\n${newBody}`;

    if (!DRY_RUN) {
      fs.writeFileSync(path.join(BLOG_DIR, self.file), newRaw, 'utf8');
    }

    modified++;
    totalNewLinks += validTop.length;

    if (samples.length < 3) {
      samples.push({
        slug,
        title: self.title,
        existingLinks: self.linkCount,
        added: validTop.map((c) => ({ slug: c.slug, title: c.title, score: c.score })),
      });
    }
  }

  console.log('');
  console.log(`[auto-internal-links] ${DRY_RUN ? 'DRY-RUN ' : ''}Stats:`);
  console.log(`  - Modifiziert:            ${modified}`);
  console.log(`  - Neue interne Links:     ${totalNewLinks}`);
  console.log(`  - Avg. neue Links/Artikel: ${modified > 0 ? (totalNewLinks / modified).toFixed(2) : '0.00'}`);
  console.log(`  - Skip (Sektion vorh.):   ${skippedAlreadyHasSection}`);
  console.log(`  - Skip (>5 links):        ${skippedTooManyLinks}`);
  console.log(`  - Skip (kein Related):    ${skippedNoRelated}`);
  console.log('');
  console.log('Sample-Output:');
  for (const s of samples) {
    console.log(`  ${s.slug} (${s.existingLinks} → ${s.existingLinks + s.added.length} Links):`);
    for (const a of s.added) {
      console.log(`    + ${a.slug} (score=${a.score})`);
    }
  }
}

main();
