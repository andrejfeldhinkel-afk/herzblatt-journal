export const prerender = false;

import type { APIRoute } from 'astro';
import { proxyToBackend } from '../../../../lib/backend-proxy';

export const POST: APIRoute = async ({ request }) => {
  return proxyToBackend(request, '/herzraum/password/verify');
};

export const GET: APIRoute = async () =>
  new Response(JSON.stringify({ error: 'Not allowed' }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  });
