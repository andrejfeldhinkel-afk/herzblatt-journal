export const prerender = false;
import type { APIRoute } from 'astro';
import { proxyToBackend } from '../../../../../lib/backend-proxy';
export const POST: APIRoute = async ({ request, params }) => proxyToBackend(request, `/herzraum/products/${params.slug}/toggle-featured`);
