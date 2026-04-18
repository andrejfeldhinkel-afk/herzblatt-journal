export const prerender = false;
import type { APIRoute } from 'astro';
import { proxyToBackend } from '../../../../lib/backend-proxy';
export const GET: APIRoute = async ({ request }) => proxyToBackend(request, '/herzraum/authors');
export const POST: APIRoute = async ({ request }) => proxyToBackend(request, '/herzraum/authors');
