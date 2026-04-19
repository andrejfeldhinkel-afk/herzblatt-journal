#!/usr/bin/env node
/**
 * audit-internal-links.mjs
 *
 * Scans apps/frontend/src/content/blog/*.md for internal links to other blog
 * articles. Articles with fewer than MIN_INTERNAL_LINKS (default 3) are
 * flagged in a report at /tmp/audit-internal-links.md.
 *
 * REPORT ONLY — does not modify any article.
 *
 * Detected link shapes:
 *   - [text](/blog/slug)
 *   - [text](/blog/slug/)
 *   - [text](/blog/slug#anchor)
 *   - [text](https://herzblatt-journal.com/blog/slug)
 *   - <a href="/blog/slug">...
 *
 * Self-links (article linking to itself) are not counted.
 *
 * Usage:
 *   node scripts/audit-internal-links.mjs
 *   node scripts/audit-internal-links.mjs --min 5
 *   node scripts/audit-internal-links.mjs --out /tmp/custom-report.md
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BLOG_DIR = path.join(ROOT, 'apps/frontend/src/content/blog');

const args = process.argv.slice(2);
function arg(name, def) {
  const i = args.indexOf(name);
  if (i >= 0 && args[i + 1] !== undefined) return args[i + 1];
  return def;
}

const MIN_INTERNAL_LINKS = Number(arg('--min', '3'));
const OUT_PATH = arg('--out', '/tmp/audit-internal-links.md');

// Match /blog/<slug> where slug = [a-z0-9-]+
// Accept both relative and absolute (with herzblatt-journal.com) URLs,
// trailing slash, #anchor, ?query.
const LINK_RE = /(?:https?:\/\/herzblatt-journal\.com)?\/blog\/([a-z0-9-]+)(?:\/|#|\?|\))/gi;

function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { fm: {}, body: raw };
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const mm = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
    if (!mm) continue;
    let v = mm[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    fm[mm[1]] = v;
  }
  return { fm, body: m[2] };
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

function main() {
  if (!fs.existsSync(BLOG_DIR)) {
    console.error(`[audit-internal-links] Blog dir not found: ${BLOG_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(BLOG_DIR).filter((f) => f.endsWith('.md'));
  const results = [];
  let totalLinks = 0;
  let articlesScanned = 0;

  for (const file of files) {
    const slug = file.replace(/\.md$/, '').toLowerCase();
    const raw = fs.readFileSync(path.join(BLOG_DIR, file), 'utf8');
    const { fm, body } = parseFrontmatter(raw);
    if (fm.draft === 'true') continue;

    const links = extractInternalLinks(body, slug);
    articlesScanned++;
    totalLinks += links.size;

    results.push({
      slug,
      title: fm.title || slug,
      date: fm.date || '',
      linkCount: links.size,
      linkedSlugs: Array.from(links).sort(),
    });
  }

  const underLinked = results
    .filter((r) => r.linkCount < MIN_INTERNAL_LINKS)
    .sort((a, b) => a.linkCount - b.linkCount || a.slug.localeCompare(b.slug));

  const avg = articlesScanned > 0 ? (totalLinks / articlesScanned).toFixed(2) : '0.00';

  const lines = [];
  lines.push(`# Internal-Link Audit — Blog Posts`);
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Scanned directory: \`apps/frontend/src/content/blog\``);
  lines.push('');
  lines.push(`## Summary`);
  lines.push('');
  lines.push(`- Articles scanned (non-draft): **${articlesScanned}**`);
  lines.push(`- Total internal blog-to-blog links: **${totalLinks}**`);
  lines.push(`- Average internal links per article: **${avg}**`);
  lines.push(`- Threshold flagged in this report: **< ${MIN_INTERNAL_LINKS}** links`);
  lines.push(`- Articles under threshold: **${underLinked.length}** (${articlesScanned > 0 ? ((underLinked.length / articlesScanned) * 100).toFixed(1) : '0.0'}%)`);
  lines.push('');
  lines.push(`## Under-linked articles (< ${MIN_INTERNAL_LINKS} internal links)`);
  lines.push('');

  if (underLinked.length === 0) {
    lines.push(`_No articles below threshold._`);
  } else {
    lines.push(`| # | Slug | Title | Internal links | Current targets |`);
    lines.push(`| --- | --- | --- | --- | --- |`);
    underLinked.forEach((r, i) => {
      const title = r.title.replace(/\|/g, '\\|').slice(0, 80);
      const targets = r.linkedSlugs.length > 0 ? r.linkedSlugs.join(', ') : '_(none)_';
      lines.push(`| ${i + 1} | \`${r.slug}\` | ${title} | ${r.linkCount} | ${targets} |`);
    });
  }

  lines.push('');
  lines.push(`## Distribution (all articles)`);
  lines.push('');
  const buckets = new Map();
  for (const r of results) {
    const k = r.linkCount >= 10 ? '10+' : String(r.linkCount);
    buckets.set(k, (buckets.get(k) || 0) + 1);
  }
  const keys = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10+'];
  lines.push(`| Links | Articles |`);
  lines.push(`| --- | --- |`);
  for (const k of keys) {
    if (buckets.has(k)) lines.push(`| ${k} | ${buckets.get(k)} |`);
  }

  lines.push('');
  lines.push(`---`);
  lines.push('');
  lines.push(`_Report only. No files were modified. Re-run with \`node scripts/audit-internal-links.mjs --min 5\` to raise the threshold._`);
  lines.push('');

  fs.writeFileSync(OUT_PATH, lines.join('\n'), 'utf8');

  console.log(`[audit-internal-links] Scanned ${articlesScanned} articles, ${underLinked.length} flagged (< ${MIN_INTERNAL_LINKS} links).`);
  console.log(`[audit-internal-links] Report: ${OUT_PATH}`);
}

main();
