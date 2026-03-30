export const prerender = false;

import type { APIRoute } from 'astro';
import fs from 'node:fs';
import path from 'node:path';

const DATA_FILE = path.join(process.cwd(), 'data', 'readers.json');

function ensureDataDir() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

interface ReaderData {
  count: number;
  lastUpdated: string;
}

function readData(): ReaderData {
  ensureDataDir();
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    }
  } catch {}
  // Starting value
  return { count: 12847, lastUpdated: new Date().toISOString() };
}

function writeData(data: ReaderData) {
  ensureDataDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// GET: Returns current count and adds 1-3 readers per request
export const GET: APIRoute = async () => {
  try {
    const data = readData();
    const now = new Date();
    const last = new Date(data.lastUpdated);

    // Calculate how many "readers" joined since last request
    // ~50-150 per hour (natural growth simulation)
    const hoursDiff = (now.getTime() - last.getTime()) / (1000 * 60 * 60);
    const growth = Math.max(1, Math.floor(hoursDiff * (50 + Math.random() * 100)));

    // Cap growth at 500 per check to avoid jumps after long downtimes
    const cappedGrowth = Math.min(growth, 500);

    data.count += cappedGrowth;
    data.lastUpdated = now.toISOString();
    writeData(data);

    return new Response(JSON.stringify({ count: data.count }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ count: 12847 }), { status: 200 });
  }
};
