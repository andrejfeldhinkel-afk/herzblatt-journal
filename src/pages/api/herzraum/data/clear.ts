export const prerender = false;

import type { APIRoute } from 'astro';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.join(process.cwd(), 'data');

// Welche Dateien dürfen gelöscht werden — Whitelist!
const ALLOWED: Record<string, string> = {
  'pageviews': 'pageviews.json',
  'clicks': 'clicks.json',
  'registrations': 'registrations.json',
  'daily-stats': 'daily-stats.json',
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const { target } = await request.json();
    if (typeof target !== 'string' || !ALLOWED[target]) {
      return new Response(JSON.stringify({ ok: false, message: 'Unbekannter Datentyp.' }), { status: 400 });
    }
    const file = path.join(DATA_DIR, ALLOWED[target]);
    if (fs.existsSync(file)) {
      fs.writeFileSync(file, '[]', 'utf-8');
    }
    return new Response(JSON.stringify({ ok: true, cleared: target }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, message: String(e) }), { status: 500 });
  }
};
