export const prerender = false;
import type { APIRoute } from 'astro';
import { proxyToBackend } from '../../../../lib/backend-proxy';
export const GET: APIRoute = async ({ request, params }) => proxyToBackend(request, `/herzraum/authors/${params.slug}`);
export const PUT: APIRoute = async ({ request, params }) => proxyToBackend(request, `/herzraum/authors/${params.slug}`);
