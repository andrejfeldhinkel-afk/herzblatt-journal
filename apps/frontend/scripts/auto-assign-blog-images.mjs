#!/usr/bin/env node
/**
 * Auto-populiert das `image:`-Frontmatter-Feld für Blog-Artikel, die keins haben.
 *
 * Strategie:
 *   1. Exakter Slug-Match in /public/images/photos/{slug}.{webp,jpg,png}
 *   2. Exakter Slug-Match in /public/images/blog/{slug}.{webp,jpg,png}
 *   3. Fuzzy: Root-Wort des Slugs (vor erstem "-") matcht Photo-Filename
 *   4. Fuzzy: 2-3 erste Wörter des Slugs matchen
 *
 * Artikel ohne Match bleiben beim BlogCard-Fallback (Gradient + Emoji).
 *
 * Idempotent — verändert nur Artikel ohne bestehendes `image:`.
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');

const BLOG_DIR = join(ROOT, 'src/content/blog');
const PHOTOS_DIR = join(ROOT, 'public/images/photos');
const BLOG_IMG_DIR = join(ROOT, 'public/images/blog');
const IMAGE_EXTS = ['.webp', '.jpg', '.jpeg', '.png'];

// Sammle alle verfügbaren Bilder (Slug-basiert)
function collectImages(dir, prefix) {
  const out = {};
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    const ext = extname(f).toLowerCase();
    if (!IMAGE_EXTS.includes(ext)) continue;
    const slug = basename(f, ext);
    if (!(slug in out)) out[slug] = `${prefix}/${f}`;
  }
  return out;
}

const photos = collectImages(PHOTOS_DIR, '/images/photos');
const blogImgs = collectImages(BLOG_IMG_DIR, '/images/blog');
const allImgs = { ...photos, ...blogImgs };
const allImgSlugs = Object.keys(allImgs).sort();

console.log(`→ ${Object.keys(photos).length} photos + ${Object.keys(blogImgs).length} blog-images = ${allImgSlugs.length} available`);

// Fuzzy-Match: gibt ein Image zurück, wenn einer der "reference"-slugs zum article-slug passt
function fuzzyMatch(articleSlug) {
  // Teile Slug in Wörter
  const words = articleSlug.split('-').filter(w => w.length >= 3);
  if (words.length === 0) return null;

  // 1. Erste 2-3 Wörter kombiniert matchen
  for (let take = Math.min(3, words.length); take >= 2; take--) {
    const prefix = words.slice(0, take).join('-');
    const hit = allImgSlugs.find(s => s === prefix || s.startsWith(prefix + '-'));
    if (hit) return { image: allImgs[hit], reason: `prefix-${take}w` };
  }

  // 2. Root-Wort (erstes Wort) als Prefix
  const root = words[0];
  if (root.length >= 4) {
    const hit = allImgSlugs.find(s => s.startsWith(root + '-') || s === root);
    if (hit) return { image: allImgs[hit], reason: 'root-word' };
  }

  return null;
}

// Scan + update
let stats = { total: 0, already: 0, exact: 0, fuzzy: 0, none: 0 };
const examples = { exact: [], fuzzy: [], none: [] };

for (const f of readdirSync(BLOG_DIR)) {
  if (!f.endsWith('.md') || f.startsWith('AUDIT-')) continue;
  stats.total++;
  const slug = basename(f, '.md');
  const path = join(BLOG_DIR, f);
  let content = readFileSync(path, 'utf8');

  // Parse frontmatter boundaries
  if (!content.startsWith('---')) { stats.none++; continue; }
  const end = content.indexOf('\n---', 3);
  if (end < 0) { stats.none++; continue; }
  const fm = content.slice(0, end + 4);
  const rest = content.slice(end + 4);

  if (/^image:\s*["'/]/m.test(fm)) { stats.already++; continue; }

  // Try exact match first
  let match = null;
  let reason = null;
  if (allImgs[slug]) { match = allImgs[slug]; reason = 'exact'; }
  else {
    const fuzzy = fuzzyMatch(slug);
    if (fuzzy) { match = fuzzy.image; reason = fuzzy.reason; }
  }

  if (!match) {
    stats.none++;
    if (examples.none.length < 5) examples.none.push(slug);
    continue;
  }

  // Inject image: field before closing ---
  const newFm = fm.replace(/\n---\s*$/, `\nimage: "${match}"\nimageAlt: "${slug.replace(/-/g, ' ')}"\n---`);
  writeFileSync(path, newFm + rest, 'utf8');

  if (reason === 'exact') {
    stats.exact++;
    if (examples.exact.length < 3) examples.exact.push(`${slug} → ${match}`);
  } else {
    stats.fuzzy++;
    if (examples.fuzzy.length < 3) examples.fuzzy.push(`${slug} → ${match} (${reason})`);
  }
}

console.log('\n=== Stats ===');
console.log(`Total articles:    ${stats.total}`);
console.log(`Already had image: ${stats.already}`);
console.log(`Exact match added: ${stats.exact}`);
console.log(`Fuzzy match added: ${stats.fuzzy}`);
console.log(`No match (fallback): ${stats.none}`);

if (examples.exact.length) {
  console.log('\nExact examples:');
  examples.exact.forEach(e => console.log('  ' + e));
}
if (examples.fuzzy.length) {
  console.log('\nFuzzy examples:');
  examples.fuzzy.forEach(e => console.log('  ' + e));
}
if (examples.none.length) {
  console.log('\nNo-match examples (stay with fallback):');
  examples.none.forEach(e => console.log('  ' + e));
}
