export const prerender = false;

import type { APIRoute } from 'astro';
import { appendJSON, type ClickEvent } from '../../lib/herzraum-data';

// Allowed target sites (whitelist approach — verhindert beliebige Einträge)
const ALLOWED_TARGETS = new Set([
  // Herzblatt partner
  'xloves', 'michverlieben', 'whatsmeet', 'onlydates69', 'singles69', 'singlescout',
  'iloves', 'sex69',
  // Andere klassische dating-Seiten (falls später gebraucht)
  'parship', 'elitepartner', 'lovescout24', 'edarling', 'bumble',
  'tinder', 'hinge', 'okcupid', 'happn', 'badoo', 'finya',
  'lovepoint', 'c-date', 'joyclub', 'secret', 'ashley-madison',
  'once', 'zoosk', 'match', 'plenty-of-fish',
]);

function sanitizePath(p: unknown): string {
  if (typeof p !== 'string') return 'unknown';
  if (!p.startsWith('/') || p.length > 200 || p.includes('..')) return 'unknown';
  if (!/^[a-zA-Z0-9\-_/.]+$/.test(p)) return 'unknown';
  return p;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    // sendBeacon kann text/plain oder application/x-www-form-urlencoded senden
    let body: any = {};
    const ct = request.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      body = await request.json();
    } else {
      const text = await request.text();
      // Versuch: JSON → fallback urlencoded
      try { body = JSON.parse(text); }
      catch {
        body = Object.fromEntries(new URLSearchParams(text).entries());
      }
    }

    const target = typeof body?.site === 'string'
      ? body.site.trim().toLowerCase()
      : (typeof body?.target === 'string' ? body.target.trim().toLowerCase() : '');

    if (!target || target.length > 50 || !/^[a-z0-9-]+$/.test(target)) {
      return new Response(JSON.stringify({ error: 'Invalid target' }), { status: 400 });
    }

    // Nur erlaubte targets tracken — unbekannte werden still verworfen
    if (!ALLOWED_TARGETS.has(target)) {
      return new Response(JSON.stringify({ ok: true, ignored: true }), { status: 200 });
    }

    const event: ClickEvent = {
      ts: new Date().toISOString(),
      target,
      source: sanitizePath(body?.source || request.headers.get('referer')),
      type: typeof body?.event === 'string' ? body.event.slice(0, 40) : 'affiliate',
    };

    appendJSON<ClickEvent>('clicks.json', event);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
};

export const GET: APIRoute = async () => {
  return new Response(JSON.stringify({ error: 'Not allowed' }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  });
};
