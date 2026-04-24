/**
 * Generic proxy-helper: leitet einen eingehenden Astro-API-Request an den Backend-Service weiter.
 *
 * Vorteile gegenüber direktem fetch aus Browser an Backend:
 * - Same-Origin (kein CORS-Debug)
 * - Cookies werden automatisch forwarded
 * - Funktioniert auch ohne custom domain (Backend über Railway-Default-URL erreichbar)
 */

const PROD_BACKEND = 'https://backend-production-c327.up.railway.app';

function getBackendUrl(): string {
  const fromEnv =
    (typeof process !== 'undefined' && process.env?.BACKEND_URL) ||
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.BACKEND_URL);
  return (fromEnv || PROD_BACKEND).replace(/\/$/, '');
}

/**
 * Forward a request (POST/GET/etc.) to the backend at the given path.
 * Returns the backend response 1:1 (status, body), mapping headers conservatively.
 *
 * Defensive error handling: any uncaught exception gives a 502 JSON response
 * instead of crashing the Astro-Node process (→ Cloudflare 502 Default).
 */
export async function proxyToBackend(
  request: Request,
  backendPath: string,
): Promise<Response> {
  try {
    const BACKEND_URL = getBackendUrl();
    const url = new URL(request.url);
    const targetUrl = BACKEND_URL + backendPath + url.search;

    // Headers weiterreichen (hop-by-hop NICHT kopieren)
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
      'x-csrf-token', // CSRF double-submit header (muss durchgereicht werden)
    ];
    for (const name of passthrough) {
      const v = request.headers.get(name);
      if (v) headers.set(name, v);
    }

    // Body lesen (mit try/catch um Stream-Issues).
    // multipart/form-data + andere Binary-Content-Types MÜSSEN als ArrayBuffer
    // weitergegeben werden, sonst wird die Boundary beim text()→string-Trip
    // zerstört und der Upload kommt als korruptes UTF-8 an.
    let body: BodyInit | undefined;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const ct = (request.headers.get('content-type') || '').toLowerCase();
      const isBinary = ct.startsWith('multipart/')
        || ct.startsWith('application/octet-stream')
        || ct.startsWith('image/')
        || ct.startsWith('video/')
        || ct.startsWith('audio/');
      try {
        if (isBinary) {
          const buf = await request.arrayBuffer();
          if (buf.byteLength > 0) body = buf;
        } else {
          const text = await request.text();
          if (text && text.length > 0) body = text;
        }
      } catch (err) {
        console.error('[backend-proxy] body read error:', err);
        body = undefined;
      }
    }

    // fetch mit try/catch
    let backendResponse: Response;
    try {
      backendResponse = await fetch(targetUrl, {
        method: request.method,
        headers,
        body,
        redirect: 'manual',
      });
    } catch (err) {
      console.error('[backend-proxy] fetch error for', targetUrl, ':', err);
      return new Response(
        JSON.stringify({ error: 'Backend unreachable', target: backendPath }),
        { status: 502, headers: { 'content-type': 'application/json' } },
      );
    }

    // Response als Text lesen, dann neue Response bauen
    // (streaming back gives issues in some node-adapter versions)
    const respText = await backendResponse.text();
    const respHeaders = new Headers();
    // `set-cookie` MUSS separat behandelt werden: Headers.forEach() iteriert
    // multi-value-headers als EINEN kommagetrennten Wert → beim Setzen geht
    // der zweite Cookie verloren (Browser akzeptiert kein `a=1, b=2` als
    // zwei Cookies). Login setzt zwei Cookies (hz_session + hz_csrf), beide
    // müssen durchkommen. Fix: set-cookie im skip-Set ausschließen und
    // stattdessen via getSetCookie() einzeln appenden.
    const skip = new Set(['connection', 'transfer-encoding', 'keep-alive', 'upgrade', 'content-length', 'content-encoding', 'set-cookie']);
    backendResponse.headers.forEach((value, key) => {
      if (!skip.has(key.toLowerCase())) {
        respHeaders.set(key, value);
      }
    });
    // Multi-value-safe: Set-Cookies einzeln appenden (Node ≥20 + undici).
    const setCookies = (backendResponse.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
    for (const cookie of setCookies) {
      respHeaders.append('set-cookie', cookie);
    }

    return new Response(respText, {
      status: backendResponse.status,
      statusText: backendResponse.statusText,
      headers: respHeaders,
    });
  } catch (err) {
    // Absoluter Safety-Net: jede Exception wird zu JSON-502
    console.error('[backend-proxy] unexpected error:', err);
    return new Response(
      JSON.stringify({ error: 'Proxy error', message: String(err) }),
      { status: 502, headers: { 'content-type': 'application/json' } },
    );
  }
}

/**
 * Server-side fetch vom Astro-SSR (z.B. Middleware) an Backend.
 */
export async function fetchBackend<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<{ ok: boolean; status: number; data: T | null }> {
  try {
    const BACKEND_URL = getBackendUrl();
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

export const BACKEND_URL = getBackendUrl();
