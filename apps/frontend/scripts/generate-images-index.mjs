#!/usr/bin/env node
/**
 * Build-Time-Script: generiert `public/images/blog/index.json` als statische
 * Liste aller Bilder im Blog-Bilder-Ordner.
 *
 * Grund: Im Railway-SSR-Kontext kann Astro-Runtime den Public-Folder nicht
 * via fs.readdirSync scannen (Public-Dir steht erst nach Deploy zur
 * Verfügung und liegt nicht am erwarteten Pfad). Stattdessen committen
 * wir zur Build-Zeit einen JSON-Index.
 *
 * Format (index.json):
 *   {
 *     "generatedAt": "2026-04-19T12:00:00Z",
 *     "count": 1784,
 *     "files": ["ab-wann-ist-es-ghosting.webp", "abendroutine-als-paar.webp", ...]
 *   }
 *
 * Script läuft zur Build-Zeit automatisch (via prebuild-Hook) oder manuell:
 *   node scripts/generate-images-index.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BLOG_IMAGES_DIR = path.join(ROOT, 'public', 'images', 'blog');
const OUTPUT_PATH = path.join(BLOG_IMAGES_DIR, 'index.json');

const IMAGE_RE = /\.(webp|jpg|jpeg|png|avif|gif|svg)$/i;

function main() {
  if (!fs.existsSync(BLOG_IMAGES_DIR)) {
    console.warn('[images-index] Blog-Bilder-Dir nicht gefunden:', BLOG_IMAGES_DIR);
    console.warn('[images-index] Schreibe leeren Index.');
    fs.writeFileSync(
      OUTPUT_PATH,
      JSON.stringify({ generatedAt: new Date().toISOString(), count: 0, files: [] }, null, 2)
    );
    return;
  }

  const entries = fs.readdirSync(BLOG_IMAGES_DIR, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && IMAGE_RE.test(e.name) && e.name !== 'index.json')
    .map((e) => e.name)
    .sort();

  const index = {
    generatedAt: new Date().toISOString(),
    count: files.length,
    files,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(index, null, 2));
  console.log(`[images-index] ${files.length} Bilder indexiert → ${OUTPUT_PATH}`);
}

main();
