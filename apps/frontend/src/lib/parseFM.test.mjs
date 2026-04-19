import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { parseFM, parseInlineArray } from './parseFM.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const bumblePath = resolve(here, '../content/blog/bumble-test-erfahrungen.md');

function extractFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) throw new Error('no frontmatter found');
  return m[1];
}

test('parseInlineArray parses double-quoted JSON-style flow arrays', () => {
  const out = parseInlineArray('["bumble test", "bumble erfahrungen"]');
  assert.deepEqual(out, ['bumble test', 'bumble erfahrungen']);
});

test('parseInlineArray parses single-quoted flow arrays', () => {
  const out = parseInlineArray("['a', 'b', 'c']");
  assert.deepEqual(out, ['a', 'b', 'c']);
});

test('parseInlineArray parses bare flow arrays', () => {
  const out = parseInlineArray('[a, b, c]');
  assert.deepEqual(out, ['a', 'b', 'c']);
});

test('parseInlineArray handles empty flow array', () => {
  assert.deepEqual(parseInlineArray('[]'), []);
});

test('parseFM handles inline-array keywords (regression for 1164 articles)', () => {
  const fm = parseFM('title: "x"\nkeywords: ["a", "b", "c"]\n');
  assert.ok(Array.isArray(fm.keywords), 'keywords must be an array');
  assert.deepEqual(fm.keywords, ['a', 'b', 'c']);
});

test('parseFM handles inline-array tags', () => {
  const fm = parseFM('title: "x"\ntags: ["t1", "t2"]\n');
  assert.ok(Array.isArray(fm.tags), 'tags must be an array');
  assert.deepEqual(fm.tags, ['t1', 't2']);
});

test('parseFM still handles block-list tags', () => {
  const fm = parseFM('tags:\n  - "a"\n  - "b"\n');
  assert.deepEqual(fm.tags, ['a', 'b']);
});

test('parseFM real article: bumble-test-erfahrungen produces array keywords and tags', async () => {
  const raw = await readFile(bumblePath, 'utf8');
  const fmRaw = extractFrontmatter(raw);
  const fm = parseFM(fmRaw);

  assert.ok(Array.isArray(fm.tags), `fm.tags is not an array: ${typeof fm.tags}`);
  assert.ok(fm.tags.length >= 1, 'fm.tags should have entries');
  assert.ok(fm.tags.includes('Bumble'), `expected "Bumble" in tags, got ${JSON.stringify(fm.tags)}`);

  assert.ok(Array.isArray(fm.keywords), `fm.keywords is not an array: ${typeof fm.keywords}`);
  assert.equal(fm.keywords.length, 10, 'bumble article has 10 keywords');
  assert.equal(fm.keywords[0], 'bumble test');
  assert.equal(fm.keywords[9], 'bumble vs tinder');

  assert.equal(fm.title, 'Bumble Test & Erfahrungen 2026: Lohnt sich die Women-First-App wirklich?');
  assert.equal(fm.author, 'markus-hoffmann');
  assert.equal(fm.draft, false);

  assert.ok(Array.isArray(fm.faq), 'faq should be preserved as array');
  assert.ok(fm.faq.length >= 3, 'bumble article has multiple faq entries');
});

test('parseFM: load-site safety — toArr simulation on non-array value never crashes', () => {
  // Mirrors the call site in the editor: `toArr(fm.keywords).join(', ')`.
  const toArr = (x) => Array.isArray(x) ? x : (x == null || x === '' ? [] : [String(x)]);

  // Pre-fix behavior: parseFM stored inline-array as a raw string. The guard must
  // still not crash even if parseFM ever regresses or a non-standard field slips through.
  assert.doesNotThrow(() => toArr('some raw string').join(', '));
  assert.doesNotThrow(() => toArr(undefined).join(', '));
  assert.doesNotThrow(() => toArr(null).join(', '));
  assert.doesNotThrow(() => toArr(['a', 'b']).join(', '));
  assert.equal(toArr(['a', 'b']).join(', '), 'a, b');
  assert.equal(toArr(undefined).join(', '), '');
});
