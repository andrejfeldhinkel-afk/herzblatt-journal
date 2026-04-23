export const prerender = false;

import type { APIRoute } from 'astro';
import { proxyToBackend } from '../../../lib/backend-proxy';

// Nur POST — GET wurde entfernt, da eine simple `<img src="…/logout">`-Injektion
// sonst CSRF-Logout ermöglicht hätte (klassische "Log victim out"-Attacke).
export const POST: APIRoute = async ({ request }) => {
  return proxyToBackend(request, '/auth/logout');
};
