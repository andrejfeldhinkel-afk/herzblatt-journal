export const prerender = false;

import type { APIRoute } from 'astro';
import { proxyToBackend } from '../../../../lib/backend-proxy';

export const GET: APIRoute = async ({ request, params }) => {
  return proxyToBackend(request, `/herzraum/articles/${params.slug}`);
};

export const PATCH: APIRoute = async ({ request, params }) => {
  return proxyToBackend(request, `/herzraum/articles/${params.slug}`);
};
