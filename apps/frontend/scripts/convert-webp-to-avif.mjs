#!/usr/bin/env node
/**
 * WebP → AVIF Conversion Script (run manually, not in build)
 *
 * Scannt public/images/blog/*.webp + public/images/photos/*.webp und
 * generiert AVIF-Varianten mit gleichem Filename (.avif) für <picture>-Tags.
 *
 * AVIF liefert ~30-50% kleinere Files als WebP bei gleicher visueller
 * Qualität. Das BlogCard+Article-Hero nutzt ein <picture>-Element mit
 * <source type="image/avif"> + <img src="...webp"> fallback für Browser
 * ohne AVIF-Support (~95% aller Nutzer haben ihn inzwischen).
 *
 * Nutzung:
 *   cd apps/frontend
 *   node scripts/convert-webp-to-avif.mjs [--force] [--limit=100]
 *
 * Flags:
 *   --force   Überschreibt existierende .avif-Files (default: skip)
 *   --limit   Stoppt nach N Konvertierungen (für Testläufe)
 *   --dir     Nur ein Verzeichnis (blog|photos|avatars)
 *
 * Laufzeit: ~1-2s pro File (sharp native). 2400+ Files ≈ 40-80min.
 * Deshalb: lokal auf Dev-Maschine laufen + committen, nicht im Build.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public', 'images');

// Arg parsing (keine Library-Abhängigkeiten)
const args = process.argv.slice(2);
const force = args.includes('--force');
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;
const dirArg = args.find(a => a.startsWith('--dir='));
const targetDir = dirArg ? dirArg.split('=')[1] : null;

// Directories zu scannen
const DIRS = targetDir
  ? [path.join(PUBLIC_DIR, targetDir)]
  : [
      path.join(PUBLIC_DIR, 'blog'),
      path.join(PUBLIC_DIR, 'photos'),
      path.join(PUBLIC_DIR, 'avatars'),
    ];

let sharp;
try {
  sharp = (await import('sharp')).default;
} catch (err) {
  console.error('[avif] sharp ist nicht installiert. npm i -D sharp');
  process.exit(1);
}

async function convertFile(webpPath) {
  const avifPath = webpPath.replace(/\.webp$/i, '.avif');
  if (!force && fs.existsSync(avifPath)) return { skipped: true };

  // AVIF-Settings: quality 50 ≈ visuell identisch zu WebP q80, aber 30-40% kleiner
  // effort 4 = guter Trade-Off zwischen Speed (6 wäre langsamer) und Size
  await sharp(webpPath)
    .avif({ quality: 50, effort: 4, chromaSubsampling: '4:2:0' })
    .toFile(avifPath);

  const webpSize = fs.statSync(webpPath).size;
  const avifSize = fs.statSync(avifPath).size;
  return { webpSize, avifSize };
}

async function main() {
  const start = Date.now();
  let converted = 0;
  let skipped = 0;
  let failed = 0;
  let savedBytes = 0;

  for (const dir of DIRS) {
    if (!fs.existsSync(dir)) {
      console.warn(`[avif] dir nicht gefunden: ${dir}`);
      continue;
    }
    const files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.webp'));
    console.log(`[avif] ${path.basename(dir)}: ${files.length} WebP-Files gefunden`);

    for (const file of files) {
      if (converted >= limit) break;
      const webpPath = path.join(dir, file);
      try {
        const result = await convertFile(webpPath);
        if (result.skipped) {
          skipped++;
          continue;
        }
        converted++;
        savedBytes += (result.webpSize - result.avifSize);
        if (converted % 50 === 0) {
          const elapsed = ((Date.now() - start) / 1000).toFixed(0);
          console.log(`[avif] ${converted} konvertiert (${elapsed}s) — Ersparnis: ${(savedBytes / 1024 / 1024).toFixed(1)} MB`);
        }
      } catch (err) {
        failed++;
        console.warn(`[avif] FEHLER ${file}: ${err.message}`);
      }
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(0);
  console.log('\n[avif] Ergebnis:');
  console.log(`  converted: ${converted}`);
  console.log(`  skipped:   ${skipped} (existierten bereits)`);
  console.log(`  failed:    ${failed}`);
  console.log(`  gespart:   ${(savedBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  Laufzeit:  ${elapsed}s`);
}

main().catch(err => {
  console.error('[avif] Fatal:', err);
  process.exit(1);
});
