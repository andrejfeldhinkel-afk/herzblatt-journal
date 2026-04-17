export const prerender = false;

import type { APIRoute } from 'astro';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const SUBS_CSV = path.join(process.cwd(), 'data', 'subscribers.csv');

/**
 * Admin-Endpoint: Downloads die komplette subscribers.csv.
 *
 * Auth: Token muss als Bearer im Authorization-Header ODER als ?token=... Query-Param übergeben werden.
 * Der Token wird über die Railway-ENV ADMIN_TOKEN gesetzt.
 *
 * Beispiel Fetch:
 *   curl -H "Authorization: Bearer $ADMIN_TOKEN" https://herzblatt-journal.com/api/admin/subscribers.csv -o subscribers.csv
 *
 * Sicherheit:
 *  - Constant-time comparison gegen Timing-Angriffe
 *  - Bei falschem/fehlendem Token: 401 ohne Hinweis auf den echten Token
 *  - Wenn ADMIN_TOKEN nicht gesetzt ist: 503 (Deaktiviert statt versehentlich offen)
 */

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'utf-8'), Buffer.from(b, 'utf-8'));
  } catch {
    return false;
  }
}

function extractToken(request: Request, url: URL): string | null {
  const auth = request.headers.get('authorization') || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  const queryToken = url.searchParams.get('token');
  if (queryToken) return queryToken.trim();
  return null;
}

export const GET: APIRoute = async ({ request }) => {
  const expected = process.env.ADMIN_TOKEN;

  // Wenn kein Token konfiguriert ist, Endpoint deaktivieren (safer default)
  if (!expected || expected.length < 20) {
    return new Response(JSON.stringify({ error: 'Admin endpoint not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(request.url);
  const provided = extractToken(request, url);

  if (!provided || !timingSafeEqual(provided, expected)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': 'Bearer realm="admin"',
      },
    });
  }

  // CSV ausliefern
  if (!fs.existsSync(SUBS_CSV)) {
    // Leere CSV mit Header zurückgeben, damit Pull-Script nicht crasht
    return new Response('timestamp,email,source,user_agent,ip_hash\n', {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="subscribers.csv"',
        'Cache-Control': 'no-store',
      },
    });
  }

  const csv = fs.readFileSync(SUBS_CSV, 'utf-8');
  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="subscribers.csv"',
      'Cache-Control': 'no-store',
    },
  });
};
