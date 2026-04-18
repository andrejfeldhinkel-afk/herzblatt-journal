export const prerender = false;
import type { APIRoute } from 'astro';
import { proxyToBackend } from '../../../../lib/backend-proxy';
export const PATCH: APIRoute = async ({ request, params }) => proxyToBackend(request, `/herzraum/todos/${params.id}`);
export const DELETE: APIRoute = async ({ request, params }) => proxyToBackend(request, `/herzraum/todos/${params.id}`);
