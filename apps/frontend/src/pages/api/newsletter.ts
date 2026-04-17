export const prerender = false;

import type { APIRoute } from 'astro';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// CSV-Datei im data/-Ordner (wird auf Railway bei jedem Deploy zurückgesetzt!)
const DATA_DIR = path.join(process.cwd(), 'data');
const SUBS_CSV = path.join(DATA_DIR, 'subscribers.csv');
const CSV_HEADER = 'timestamp,email,source,user_agent,ip_hash\n';

// Proper email validation regex (RFC 5322 simplified)
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

// Whitelist erlaubter source-Werte — verhindert willkürliche Einträge
const ALLOWED_SOURCES = new Set([
  'newsletter-footer',
  'newsletter-inline',
  'ebook-waitlist',
  'quiz-result',
  'exit-intent',
  'blog-cta',
  'unknown',
]);

// ip_hash: SHA-256(ip + salt) — DSGVO-konform, IP selbst wird nicht gespeichert
const IP_SALT = process.env.IP_SALT || 'herzblatt-default-salt-please-change';

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(SUBS_CSV)) fs.writeFileSync(SUBS_CSV, CSV_HEADER, 'utf-8');
}

function readEmails(): Set<string> {
  ensureFile();
  try {
    const content = fs.readFileSync(SUBS_CSV, 'utf-8');
    const lines = content.split('\n').slice(1); // skip header
    const emails = new Set<string>();
    for (const line of lines) {
      if (!line.trim()) continue;
      // robust: E-Mail ist 2. Spalte, case-insensitive
      const parts = parseCsvLine(line);
      if (parts[1]) emails.add(parts[1].toLowerCase());
    }
    return emails;
  } catch {
    return new Set<string>();
  }
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && inQuotes && line[i + 1] === '"') { current += '"'; i++; }
    else if (c === '"') inQuotes = !inQuotes;
    else if (c === ',' && !inQuotes) { result.push(current); current = ''; }
    else current += c;
  }
  result.push(current);
  return result;
}

function csvEscape(value: string): string {
  // Alle Werte die Komma, Quote oder Newline enthalten, werden gequotet
  if (/[",\n\r]/.test(value)) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

function appendRow(row: Record<string, string>) {
  ensureFile();
  const line =
    [row.timestamp, row.email, row.source, row.user_agent, row.ip_hash]
      .map((v) => csvEscape(v || ''))
      .join(',') + '\n';
  fs.appendFileSync(SUBS_CSV, line, 'utf-8');
}

function hashIp(ip: string): string {
  return crypto.createHash('sha256').update(ip + IP_SALT).digest('hex').slice(0, 16);
}

function getClientIp(request: Request): string {
  // Railway/Fastly liefert x-forwarded-for
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const real = request.headers.get('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return new Response(JSON.stringify({ success: false, message: 'Invalid content type.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json();
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const rawSource = typeof body.source === 'string' ? body.source.trim() : '';
    const source = ALLOWED_SOURCES.has(rawSource) ? rawSource : 'unknown';

    if (!email || email.length > 254 || !EMAIL_REGEX.test(email)) {
      return new Response(JSON.stringify({ success: false, message: 'Bitte gib eine gültige E-Mail-Adresse ein.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const existing = readEmails();
    if (existing.has(email)) {
      return new Response(JSON.stringify({ success: true, message: 'Du bist bereits angemeldet!' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const userAgent = (request.headers.get('user-agent') || '').slice(0, 200);
    const ipHash = hashIp(getClientIp(request));

    appendRow({
      timestamp: new Date().toISOString(),
      email,
      source,
      user_agent: userAgent,
      ip_hash: ipHash,
    });

    return new Response(JSON.stringify({ success: true, message: 'Willkommen! Du erhältst bald unsere besten Dating-Tipps.' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, message: 'Ein Fehler ist aufgetreten. Bitte versuche es später erneut.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

// GET is blocked by middleware — no subscriber count exposure
export const GET: APIRoute = async () => {
  return new Response(JSON.stringify({ error: 'Not allowed' }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  });
};
