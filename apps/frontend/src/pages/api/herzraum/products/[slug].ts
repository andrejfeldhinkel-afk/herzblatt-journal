export const prerender = false;
import type { APIRoute } from 'astro';
import { proxyToBackend } from '../../../../lib/backend-proxy';
export const GET: APIRoute = async ({ request, params }) => proxyToBackend(request, `/herzraum/products/${params.slug}`);
export const PATCH: APIRoute = async ({ request, params }) => proxyToBackend(request, `/herzraum/products/${params.slug}`);
export const DELETE: APIRoute = async ({ request, params }) => proxyToBackend(request, `/herzraum/products/${params.slug}`);
