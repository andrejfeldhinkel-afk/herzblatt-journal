export const prerender = false;

import type { APIRoute } from 'astro';
import { proxyToBackend } from '../../../../lib/backend-proxy';

export const GET: APIRoute = async ({ request }) => {
  return proxyToBackend(request, '/herzraum/newsletter-broadcast/');
};

export const POST: APIRoute = async ({ request }) => {
  return proxyToBackend(request, '/herzraum/newsletter-broadcast/');
};
