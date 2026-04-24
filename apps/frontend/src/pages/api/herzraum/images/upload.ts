export const prerender = false;

import type { APIRoute } from 'astro';
import { proxyToBackend } from '../../../../lib/backend-proxy';

// multipart/form-data muss 1:1 weitergereicht werden
export const POST: APIRoute = async ({ request }) => {
  return proxyToBackend(request, '/herzraum/images/upload');
};
