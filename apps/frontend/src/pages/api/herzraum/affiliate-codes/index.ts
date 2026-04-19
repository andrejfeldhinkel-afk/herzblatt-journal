export const prerender = false;
import type { APIRoute } from 'astro';
import { proxyToBackend } from '../../../../lib/backend-proxy';
export const GET: APIRoute = async ({ request }) => proxyToBackend(request, '/herzraum/affiliate-codes');
