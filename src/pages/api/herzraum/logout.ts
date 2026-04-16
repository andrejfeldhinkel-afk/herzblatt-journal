export const prerender = false;

import type { APIRoute } from 'astro';
import {
  buildLogoutCookie,
  destroySession,
  extractToken,
} from '../../../lib/herzraum-auth';

export const POST: APIRoute = async ({ request }) => {
  const token = extractToken(request.headers.get('cookie'));
  destroySession(token);

  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.append('Set-Cookie', buildLogoutCookie());
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
};

// GET = Logout-Link aus UI (<a href="/api/herzraum/logout">)
export const GET: APIRoute = async ({ request }) => {
  const token = extractToken(request.headers.get('cookie'));
  destroySession(token);

  const headers = new Headers({ Location: '/herzraum/login' });
  headers.append('Set-Cookie', buildLogoutCookie());
  return new Response(null, { status: 302, headers });
};
