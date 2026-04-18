export const prerender = false;

import type { APIRoute } from 'astro';
import { proxyToBackend } from '../../../lib/backend-proxy';

export const POST: APIRoute = async ({ request }) => {
  return proxyToBackend(request, '/push/subscribe');
};
