export const prerender = false;

import type { APIRoute } from 'astro';
import { proxyToBackend } from '../../../../lib/backend-proxy';

// Wichtig: Hono im Backend routet '/herzraum/newsletter-broadcast' OHNE trailing slash.
// Mit '/' kam 404 zurück ("Internal Server Error" im Frontend).
export const GET: APIRoute = async ({ request }) => {
  return proxyToBackend(request, '/herzraum/newsletter-broadcast');
};

export const POST: APIRoute = async ({ request }) => {
  return proxyToBackend(request, '/herzraum/newsletter-broadcast');
};
