export const prerender = false;

import type { APIRoute } from 'astro';
import {
  attemptLogin,
  buildSessionCookie,
  getClientIp,
} from '../../../lib/herzraum-auth';

export const POST: APIRoute = async ({ request }) => {
  try {
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return new Response(JSON.stringify({ ok: false, message: 'Invalid content type.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json();
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!password || password.length < 1 || password.length > 256) {
      return new Response(JSON.stringify({ ok: false, message: 'Ungültige Eingabe.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const ip = getClientIp(request);
    const result = attemptLogin(password, ip);

    if (!result.ok) {
      // Einheitliche Fehlermeldung — kein Hint, woran's lag
      if (result.reason === 'rate-limit') {
        return new Response(
          JSON.stringify({ ok: false, message: 'Zu viele Versuche. Bitte in einigen Minuten erneut versuchen.' }),
          { status: 429, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (result.reason === 'not-configured') {
        return new Response(
          JSON.stringify({ ok: false, message: 'Herzraum ist nicht konfiguriert.' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({ ok: false, message: 'Anmeldung fehlgeschlagen.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const headers = new Headers({ 'Content-Type': 'application/json' });
    headers.append('Set-Cookie', buildSessionCookie(result.token));

    return new Response(
      JSON.stringify({ ok: true, redirect: '/herzraum' }),
      { status: 200, headers }
    );
  } catch {
    return new Response(
      JSON.stringify({ ok: false, message: 'Server-Fehler.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const GET: APIRoute = async () => {
  return new Response(JSON.stringify({ error: 'Not allowed' }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  });
};
