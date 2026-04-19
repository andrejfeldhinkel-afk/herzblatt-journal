export const prerender = false;

import type { APIRoute } from 'astro';
import { proxyToBackend } from '../../../lib/backend-proxy';

// Proxy to backend /api/checkout/micropayment — signs Bezahlfenster-URL
// and returns { url } which the browser then redirects to.
export const POST: APIRoute = async ({ request }) => {
  return proxyToBackend(request, '/api/checkout/micropayment');
};

export const GET: APIRoute = async ({ request }) => {
  return proxyToBackend(request, '/api/checkout/micropayment');
};
