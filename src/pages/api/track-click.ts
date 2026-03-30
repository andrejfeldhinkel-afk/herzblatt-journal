export const prerender = false;

import type { APIRoute } from 'astro';
import fs from 'node:fs';
import path from 'node:path';

const DATA_FILE = path.join(process.cwd(), 'data', 'clicks.json');

function ensureDataDir() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readClicks(): Record<string, number> {
  ensureDataDir();
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    }
  } catch {}
  return {};
}

function writeClicks(data: Record<string, number>) {
  ensureDataDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// POST: Track a click
export const POST: APIRoute = async ({ request }) => {
  try {
    const { site } = await request.json();
    if (!site || typeof site !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing site parameter' }), { status: 400 });
    }

    const clicks = readClicks();
    clicks[site] = (clicks[site] || 0) + 1;
    writeClicks(clicks);

    return new Response(JSON.stringify({ success: true, clicks: clicks[site] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
};

// GET: Read current click counts
export const GET: APIRoute = async () => {
  try {
    const clicks = readClicks();
    return new Response(JSON.stringify(clicks), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({}), { status: 200 });
  }
};
