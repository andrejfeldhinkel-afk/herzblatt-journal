#!/usr/bin/env node
/**
 * Generate PWA icons from /apps/frontend/public/icon.svg
 *
 * Outputs:
 *   icons/icon-192.png       — Android home screen / manifest
 *   icons/icon-512.png       — splash / manifest
 *   icons/icon-maskable-512.png — Android adaptive icon (safe zone padded)
 *   apple-touch-icon.png     — iOS home screen (180x180) — overwrites existing
 */
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const root = resolve(dirname(__filename), '..');
// Resolve sharp from the frontend workspace (where it's a devDependency).
const require = createRequire(resolve(root, 'apps/frontend/package.json'));
const sharp = require('sharp');
const publicDir = resolve(root, 'apps/frontend/public');
const iconsDir = resolve(publicDir, 'icons');
mkdirSync(iconsDir, { recursive: true });

const svg = readFileSync(resolve(publicDir, 'icon.svg'));

// Maskable needs a safe zone — render on larger canvas so the heart fits
// inside Android's 80% safe area.
const maskableSvg = Buffer.from(
  readFileSync(resolve(publicDir, 'icon.svg'), 'utf8')
    // replace background gradient with solid primary for stronger maskable fill
    .replace(
      '<rect width="512" height="512" fill="url(#bgGrad)"/>',
      '<rect width="512" height="512" fill="#fff1f2"/>',
    )
    // scale heart down to fit safe zone (~70% of canvas)
    .replace(
      'translate(256 280) scale(7.5) translate(-20 -20)',
      'translate(256 280) scale(5.2) translate(-20 -20)',
    ),
);

async function renderPng(source, size, outPath) {
  await sharp(source)
    .resize(size, size, { fit: 'contain', background: { r: 255, g: 241, b: 242, alpha: 1 } })
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  console.log(`  ${outPath.replace(root + '/', '')} (${size}x${size})`);
}

console.log('Generating PWA icons…');
await renderPng(svg, 192, resolve(iconsDir, 'icon-192.png'));
await renderPng(svg, 512, resolve(iconsDir, 'icon-512.png'));
await renderPng(maskableSvg, 512, resolve(iconsDir, 'icon-maskable-512.png'));
await renderPng(svg, 180, resolve(publicDir, 'apple-touch-icon.png'));
console.log('Done.');
