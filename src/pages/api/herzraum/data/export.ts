export const prerender = false;

import type { APIRoute } from 'astro';
import fs from 'node:fs';
import path from 'node:path';
import { readNewsletterCsv } from '../../../../lib/herzraum-data';

const DATA_DIR = path.join(process.cwd(), 'data');

/**
 * Export aller Tracking-Daten als JSON-Bundle (nicht als ZIP — kein extra npm dep).
 * Der Admin bekommt ein JSON-Objekt mit allen Arrays, kann es selbst in .json speichern.
 */
export const GET: APIRoute = async () => {
  function read(f: string) {
    const p = path.join(DATA_DIR, f);
    if (!fs.existsSync(p)) return null;
    try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; }
  }

  const bundle = {
    exportedAt: new Date().toISOString(),
    pageviews: read('pageviews.json') || [],
    clicks: read('clicks.json') || [],
    registrations: read('registrations.json') || [],
    newsletter: readNewsletterCsv(),
  };

  return new Response(JSON.stringify(bundle, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="herzraum-export-' + new Date().toISOString().slice(0,10) + '.json"',
      'Cache-Control': 'no-store',
    },
  });
};
