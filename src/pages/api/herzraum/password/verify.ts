export const prerender = false;

import type { APIRoute } from 'astro';
import { verifyCurrentPassword } from '../../../../lib/herzraum-auth';

/**
 * Prüft das Current-Passwort (z.B. bevor eine gefährliche Aktion ausgeführt wird).
 * Passwort-CHANGE geht nicht zur Laufzeit — HERZRAUM_PASSWORD ist eine ENV
 * und muss auf Railway manuell geändert werden. Dashboard zeigt den Hinweis.
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const pw = typeof body?.password === 'string' ? body.password : '';
    const ok = verifyCurrentPassword(pw);
    return new Response(JSON.stringify({ ok }), { status: ok ? 200 : 401, headers: { 'Content-Type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ ok: false }), { status: 500 });
  }
};
