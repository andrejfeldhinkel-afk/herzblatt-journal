export const prerender = false;

import type { APIRoute } from 'astro';
import fs from 'node:fs';
import path from 'node:path';

const SUBS_FILE = path.join(process.cwd(), 'newsletter-subscribers.json');

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
    const body = await request.json();
    const email = body.email?.trim()?.toLowerCase();

    if (!email || !email.includes('@') || !email.includes('.')) {
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

export const GET: APIRoute = async () => {
  const subs = getSubscribers();
  return new Response(JSON.stringify({ count: subs.length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
