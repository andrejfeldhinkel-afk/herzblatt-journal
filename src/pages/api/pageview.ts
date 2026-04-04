export const prerender = false;

import type { APIRoute } from 'astro';
import fs from 'node:fs';
import path from 'node:path';

const DATA_FILE = path.join(process.cwd(), 'data', 'pageviews.json');

function ensureDataDir() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

interface PageviewData {
  total: number;
  today: string;
  todayCount: number;
  pages: Record<string, number>;
}

function readData(): PageviewData {
  ensureDataDir();
  try {
    if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {}
  return { total: 0, today: '', todayCount: 0, pages: {} };
}

function writeData(data: PageviewData) {
  ensureDataDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Validate path: must start with /, max 500 chars, only valid URL characters
function isValidPath(p: unknown): p is string {
  if (typeof p !== 'string') return false;
  if (p.length === 0 || p.length > 500) return false;
  if (!p.startsWith('/')) return false;
  // Block path traversal
  if (p.includes('..') || p.includes('//')) return false;
  return /^[a-zA-Z0-9\-_/.]+$/.test(p);
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const pagePath = body.path;

    if (!isValidPath(pagePath)) {
      return new Response(JSON.stringify({ error: 'Invalid path' }), { status: 400 });
    }

    const data = readData();
    const today = new Date().toISOString().slice(0, 10);

    data.total++;
    data.pages[pagePath] = (data.pages[pagePath] || 0) + 1;

    if (data.today === today) {
      data.todayCount++;
    } else {
      data.today = today;
      data.todayCount = 1;
    }

    writeData(data);

    // Only return aggregate counts, not per-page data
    return new Response(JSON.stringify({ total: data.total, todayCount: data.todayCount }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response('{}', { status: 200 });
  }
};

// GET is blocked by middleware — no pageview data exposure
export const GET: APIRoute = async () => {
  return new Response(JSON.stringify({ error: 'Not allowed' }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  });
};
