/**
 * Generic proxy-helper: leitet einen eingehenden Astro-API-Request an den Backend-Service weiter.
 *
 * Vorteile gegenüber direktem fetch aus Browser an Backend:
 * - Same-Origin (kein CORS-Debug)
 * - Cookies werden automatisch forwarded
 * - Funktioniert auch ohne custom domain (Backend über Railway-Default-URL erreichbar)
 *
 * BACKEND_URL wird aus ENV gelesen (Fallback localhost für lokale Tests).
 */

// Prod-Default: Railway-Backend-Domain. In Dev über BACKEND_URL=http://localhost:3001
// überschreibbar. Sobald DNS api.herzblatt-journal.com propagiert ist, darf der User
// BACKEND_URL=https://api.herzblatt-journal.com setzen (Railway-ENV).
const PROD_BACKEND = 'https://backend-production-c327.up.railway.app';
const BACKEND_URL =
  (import.meta.env.BACKEND_URL || process.env.BACKEND_URL || PROD_BACKEND)
    .replace(/\/$/, '');

/**
 * Forward a request (POST/GET/etc.) to the backend at the given path.
 * Copies: body, content-type, authorization, cookie, user-agent, x-forwarded-for.
 * Returns the backend response 1:1 (status, headers, body).
 */
export async function proxyToBackend(
  request: Request,
  backendPath: string,
): Promise<Response> {
  const url = new URL(request.url);
  const targetUrl = BACKEND_URL + backendPath + url.search;

  // Wichtige Headers weiterreichen. Hop-by-Hop-Headers (host, connection) NICHT kopieren.
  const headers = new Headers();
  const passthrough = [
    'content-type',
    'authorization',
    'cookie',
    'user-agent',
    'x-forwarded-for',
    'x-real-ip',
    'referer',
    'accept',
  ];
  for (const name of passthrough) {
    const v = request.headers.get(name);
    if (v) headers.set(name, v);
  }

  // Client-IP weiterreichen (damit Backend korrektes hashIp() bekommt)
  const clientIp = request.headers.get('x-forwarded-for') ||
                   request.headers.get('x-real-ip') ||
                   '';
  if (clientIp && !headers.has('x-forwarded-for')) {
    headers.set('x-forwarded-for', clientIp);
  }

  let body: BodyInit | undefined;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    body = await request.text();
  }

  let backendResponse: Response;
  try {
    backendResponse = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
      redirect: 'manual',
    });
  } catch (err) {
    console.error('[backend-proxy] fetch error:', err);
    return new Response(
      JSON.stringify({ error: 'Backend unreachable' }),
      { status: 502, headers: { 'content-type': 'application/json' } },
    );
  }

  // Response-Headers weiterreichen — außer hop-by-hop
  const respHeaders = new Headers();
  const skip = new Set(['connection', 'transfer-encoding', 'keep-alive', 'upgrade']);
  backendResponse.headers.forEach((value, key) => {
    if (!skip.has(key.toLowerCase())) {
      respHeaders.set(key, value);
    }
  });

  return new Response(backendResponse.body, {
    status: backendResponse.status,
    statusText: backendResponse.statusText,
    headers: respHeaders,
  });
}

/**
 * Server-side fetch vom Astro-SSR (z.B. Middleware oder Seiten-Rendering) an Backend.
 * Gibt { ok, status, data } zurück.
 */
export async function fetchBackend<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<{ ok: boolean; status: number; data: T | null }> {
  try {
    const res = await fetch(BACKEND_URL + path, options);
    let data: any = null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      try { data = await res.json(); } catch { data = null; }
    }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    console.error('[backend-proxy] server fetch error:', err);
    return { ok: false, status: 0, data: null };
  }
}

export { BACKEND_URL };
