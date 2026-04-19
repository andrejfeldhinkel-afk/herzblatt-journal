export const prerender = false;

import type { APIRoute } from 'astro';
import { proxyToBackend } from '../../../../../lib/backend-proxy';

export const POST: APIRoute = async ({ request, params }) => {
  const id = String(params.id || '').trim();
  if (!id) {
    return new Response(JSON.stringify({ error: 'missing-id' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return proxyToBackend(request, `/herzraum/purchases/${encodeURIComponent(id)}/resend-access`);
};
