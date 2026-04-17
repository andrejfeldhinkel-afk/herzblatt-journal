export const prerender = false;

import type { APIRoute } from 'astro';
import { appendJSON, type PageviewEvent } from '../../lib/herzraum-data';

// Validate path: must start with /, max 500 chars, only valid URL characters
function isValidPath(p: unknown): p is string {
  if (typeof p !== 'string') return false;
  if (p.length === 0 || p.length > 500) return false;
  if (!p.startsWith('/')) return false;
  if (p.includes('..') || p.includes('//')) return false;
  return /^[a-zA-Z0-9\-_/.]+$/.test(p);
}

function extractReferrerHost(ref: unknown): string {
  if (typeof ref !== 'string' || !ref) return 'direct';
  try {
    return new URL(ref).hostname || 'direct';
  } catch {
    return 'direct';
  }
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const pagePath = body?.path;

    if (!isValidPath(pagePath)) {
      return new Response(JSON.stringify({ error: 'Invalid path' }), { status: 400 });
    }

    const event: PageviewEvent = {
      ts: new Date().toISOString(),
      path: pagePath,
      referrer: extractReferrerHost(body?.referrer || request.headers.get('referer')),
      ua: (request.headers.get('user-agent') || '').slice(0, 120),
    };

    appendJSON<PageviewEvent>('pageviews.json', event);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response('{}', { status: 200 });
  }
};

export const GET: APIRoute = async () => {
  return new Response(JSON.stringify({ error: 'Not allowed' }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  });
};
