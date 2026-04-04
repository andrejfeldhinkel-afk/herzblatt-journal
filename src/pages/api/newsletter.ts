export const prerender = false;

import type { APIRoute } from 'astro';
import fs from 'node:fs';
import path from 'node:path';

const SUBS_FILE = path.join(process.cwd(), 'newsletter-subscribers.json');

// Proper email validation regex (RFC 5322 simplified)
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

function getSubscribers(): string[] {
  if (!fs.existsSync(SUBS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(SUBS_FILE, 'utf-8'));
  } catch { return []; }
}

function saveSubscribers(subs: string[]) {
  fs.writeFileSync(SUBS_FILE, JSON.stringify([...new Set(subs)], null, 2));
}

export const POST: APIRoute = async ({ request }) => {
  try {
    // Validate content type
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return new Response(JSON.stringify({ success: false, message: 'Invalid content type.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json();
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

    // Validate email format
    if (!email || email.length > 254 || !EMAIL_REGEX.test(email)) {
      return new Response(JSON.stringify({ success: false, message: 'Bitte gib eine gültige E-Mail-Adresse ein.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const subs = getSubscribers();
    if (subs.includes(email)) {
      return new Response(JSON.stringify({ success: true, message: 'Du bist bereits angemeldet!' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    subs.push(email);
    saveSubscribers(subs);

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
