export const prerender = false;

import type { APIRoute } from 'astro';

// External API URL from environment variable (fallback for backward compat)
const REGISTER_API_URL = import.meta.env.REGISTER_API_URL || 'https://be.xloves.com/api/auth/register';

// Simple input validators
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

function sanitizeString(val: unknown, maxLength = 100): string | null {
  if (typeof val !== 'string') return null;
  const trimmed = val.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) return null;
  return trimmed;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    // Validate content type
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return new Response(JSON.stringify({ message: 'Invalid content type.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json();

    // Validate required fields
    const email = sanitizeString(body.email, 254);
    const username = sanitizeString(body.username, 50);
    const password = sanitizeString(body.password, 128);
    const gender = sanitizeString(body.gender, 20);

    if (!email || !EMAIL_REGEX.test(email.toLowerCase())) {
      return new Response(JSON.stringify({ message: 'Ungültige E-Mail-Adresse.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!username || username.length < 3) {
      return new Response(JSON.stringify({ message: 'Benutzername muss mindestens 3 Zeichen lang sein.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!password || password.length < 6) {
      return new Response(JSON.stringify({ message: 'Passwort muss mindestens 6 Zeichen lang sein.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Only forward validated/sanitized fields (no raw body passthrough)
    const sanitizedBody: Record<string, string> = {
      email: email.toLowerCase(),
      username,
      password,
    };
    if (gender) sanitizedBody.gender = gender;
    if (body.birthday && typeof body.birthday === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.birthday)) {
      sanitizedBody.birthday = body.birthday;
    }

    const response = await fetch(REGISTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(sanitizedBody),
    });

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ message: 'Server-Fehler bei der Registrierung.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
