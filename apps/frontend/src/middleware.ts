import { defineMiddleware } from 'astro:middleware';
import { captureError } from './lib/sentry';

// ─── Rate Limiter (in-memory, per IP) ───────────────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMIT_MAX = 15; // max 15 POST requests per minute per IP

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return false;
  }

  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

// Clean up stale entries every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}, 5 * 60_000);

// ─── Redirects ──────────────────────────────────────────────────
const redirects: Record<string, string> = {
  '/blog/dating-mit-kindern': '/blog/dating-mit-kind',
  '/blog/online-dating-sicherheit-tipps': '/blog/online-dating-sicherheit',
  '/blog/selbstbewusstsein-staerken': '/blog/selbstakzeptanz-dating-erfolg',

  // Duplikate zusammengefuehrt (2026-03-24)
  '/blog/kennenlernen-fragen-date': '/blog/dating-fragen-kennenlernen',
  '/blog/dating-als-alleinerziehend-tipps': '/blog/dating-mit-kindern-patchwork',
  '/blog/dating-mit-chronischer-krankheit': '/blog/dating-mit-krankheit-chronisch',
  '/blog/dating-nach-narzissmus': '/blog/dating-nach-narcissistischer-beziehung',
  '/blog/dating-als-schuechterne-frau': '/blog/dating-tipps-fuer-schuechterne-frauen',
  '/blog/erste-nachricht-online-dating': '/blog/dating-kommunikation-erste-nachricht-tipps',
  '/blog/beziehung-emotionale-intelligenz': '/blog/emotionale-intelligenz-beziehung',
  '/blog/emotionale-intelligenz-beziehung-entwickeln': '/blog/emotionale-intelligenz-beziehung',
  '/blog/erste-beziehung-ratgeber': '/blog/erste-beziehung-tipps-guide',
  '/blog/gaslighting-erkennen-beziehung-guide': '/blog/gaslighting-beziehung',
  '/blog/ghosting-umgehen': '/blog/ghosting-komplett-guide',
  '/blog/inneres-kind-heilen-beziehung': '/blog/inner-child-beziehung',
  '/blog/beziehung-introvertiert-extrovertiert-paar': '/blog/dating-introvertiert-extrovertiert-paar-guide',
  '/blog/lovebombing-erkennen-schuetzen': '/blog/love-bombing-erkennen-schuetzen',
  '/blog/partner-mit-depression-unterstuetzen': '/blog/partner-depression-unterstuetzen-guide',
  '/blog/beziehung-toxische-schwiegereltern': '/blog/beziehung-toxische-schwiegereltern-umgang',
  '/blog/beziehung-unterschiedliche-libido': '/blog/beziehung-unterschiedliche-libido-loesungen',
  '/blog/verlustangst-beziehung': '/blog/verlustangst-beziehung-ueberwinden',
  '/blog/beziehung-zusammenziehen-richtige-zeitpunkt': '/blog/zusammenziehen-oder-nicht',
  '/blog/beziehung-staerken-5-sprachen-der-liebe': '/blog/liebessprachen-komplett-guide',
  '/blog/love-languages-beziehung': '/blog/liebessprachen-komplett-guide',
  '/blog/love-languages-komplett-guide': '/blog/liebessprachen-komplett-guide',
  '/blog/liebessprachen-test-anleitung': '/blog/liebessprachen-komplett-guide',
  '/blog/beziehung-eifersucht-ueberwinden': '/blog/beziehung-und-eifersucht-ueberwinden',
  '/blog/eifersucht-beziehung-ueberwinden': '/blog/beziehung-und-eifersucht-ueberwinden',
  '/blog/eifersucht-ueberwinden-tipps': '/blog/beziehung-und-eifersucht-ueberwinden',
  '/blog/beziehung-streit-richtig': '/blog/streit-beziehung-richtig-loesen',
  '/blog/richtig-streiten-beziehung': '/blog/streit-beziehung-richtig-loesen',
  '/blog/zusammenziehen-tipps': '/blog/zusammenziehen-oder-nicht',
  '/blog/zusammenziehen-wann-richtig': '/blog/zusammenziehen-oder-nicht',
  '/blog/beziehung-nach-trennung-freunde-bleiben': '/blog/freundschaft-nach-trennung',
  '/blog/trennung-freundschaft-bleiben': '/blog/freundschaft-nach-trennung',
  '/blog/dating-burnout-recovery': '/blog/dating-nach-burnout',
  '/blog/dating-burnout': '/blog/dating-nach-burnout',
  '/blog/catfishing-online-dating-schutz': '/blog/catfishing-erkennen-schuetzen',
  '/blog/date-ideen-fuer-jede-situation': '/blog/date-ideen-komplett-sammlung',
  '/blog/date-ideen-nach-budget': '/blog/date-ideen-komplett-sammlung',
  '/blog/emotionale-intelligenz-dating': '/blog/emotionale-intelligenz-beziehung',
  '/blog/emotionale-intelligenz-verbessern': '/blog/emotionale-intelligenz-beziehung',
  '/blog/erste-beziehung-tipps': '/blog/erste-beziehung-tipps-guide',
  '/blog/dating-introvertiert-extrovertiert': '/blog/dating-introvertiert-extrovertiert-paar-guide',
  '/blog/beziehung-introvertiert-extrovertiert': '/blog/dating-introvertiert-extrovertiert-paar-guide',
};

// ─── Blocked GET endpoints (prevent data exposure) ──────────────
const blockedGetPaths = new Set([
  '/api/newsletter',   // would expose subscriber count
  '/api/pageview',     // would expose all pageview data
  '/api/track-click',  // would expose all click data
]);

// ─── Herzraum Auth Guard ────────────────────────────────────────
// Session wird jetzt vom Backend verifiziert — Frontend-Middleware ruft
// GET /auth/verify auf dem Backend-Service und forwarded den Cookie mit.
// Der Cookie hat Domain=.herzblatt-journal.com, also wird er von der
// herzblatt-journal.com-Page auch an das Backend mitgeschickt (Subdomain-scoped).
const PROD_BACKEND = 'https://backend-production-c327.up.railway.app';
const BACKEND_URL = (import.meta.env.BACKEND_URL || process.env.BACKEND_URL || PROD_BACKEND).replace(/\/$/, '');

async function verifyHerzraumSession(cookieHeader: string | null): Promise<boolean> {
  if (!cookieHeader || !cookieHeader.includes('hz_session=')) return false;
  try {
    const res = await fetch(BACKEND_URL + '/auth/verify', {
      method: 'GET',
      headers: { cookie: cookieHeader },
    });
    return res.ok;
  } catch (err) {
    console.error('[middleware] /auth/verify error:', err);
    return false;
  }
}

function isHerzraumPublic(path: string): boolean {
  // Login-Page und Auth-Proxy dürfen ohne Session erreicht werden
  return path === '/herzraum/login' ||
         path === '/api/herzraum/auth' ||
         path === '/api/herzraum/logout';
}

function isHerzraumProtected(path: string): boolean {
  return path === '/herzraum' || path.startsWith('/herzraum/') || path.startsWith('/api/herzraum/');
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { request, redirect } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, '') || '/';

  // ─── Herzraum-Dashboard schützen (Backend-Auth) ────────────
  if (isHerzraumProtected(path) && !isHerzraumPublic(path)) {
    const ok = await verifyHerzraumSession(request.headers.get('cookie'));
    if (!ok) {
      if (path.startsWith('/api/')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return redirect('/herzraum/login', 302);
    }
  }

  // ─── Redirects ─────────────────────────────────────────────
  if (redirects[path]) {
    return redirect(redirects[path], 301);
  }

  // ─── Rate limiting on POST /api/* ──────────────────────────
  if (request.method === 'POST' && path.startsWith('/api/')) {
    // clientAddress may not be available on prerendered routes — use header fallback
    let ip = 'unknown';
    try { ip = context.clientAddress || ip; } catch {}
    if (ip === 'unknown') {
      ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    }
    if (isRateLimited(ip)) {
      return new Response(JSON.stringify({ error: 'Zu viele Anfragen. Bitte warte einen Moment.' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': '60',
        },
      });
    }
  }

  // ─── Block GET on sensitive API endpoints ──────────────────
  if (request.method === 'GET' && blockedGetPaths.has(path)) {
    return new Response(JSON.stringify({ error: 'Not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let response: Response;
  try {
    response = await next();
  } catch (err) {
    // Page-rendering error → an Sentry melden + 500 zurückgeben
    console.error('[middleware] next() error:', err);
    captureError(err, { path, method: request.method });
    return new Response(
      '<!DOCTYPE html><html><head><title>500</title></head><body><h1>500 — Serverfehler</h1><p>Wir wurden benachrichtigt. Bitte Seite neu laden.</p></body></html>',
      { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }

  // If a /tags/* page returns 404, redirect to /tags/ instead
  if (response.status === 404 && path.startsWith('/tags/') && path !== '/tags') {
    return redirect('/tags/', 302);
  }

  // ─── Security Headers (all responses) ──────────────────────
  // Drop deprecated X-XSS-Protection — modern CSP replaces it and the old
  // header can actually introduce XSS in older IE/Safari versions.
  const newHeaders = new Headers(response.headers);
  newHeaders.set('X-Content-Type-Options', 'nosniff');
  newHeaders.set('X-Frame-Options', 'SAMEORIGIN');
  newHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Permissions-Policy: wir blocken Sensor/Device-APIs + Federated-Credentials
  // für eigene Origin UND alle iframes (sonst kann ein eingebetteter
  // Third-Party-Frame wie Whop-Checkout diese zwar nicht zusätzlich
  // anfordern, aber das Standardverhalten wäre "allowed by default").
  newHeaders.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(self "https://js.whop.com"), ' +
    'usb=(), magnetometer=(), gyroscope=(), accelerometer=(), ' +
    'fullscreen=(self), interest-cohort=(), browsing-topics=()',
  );
  // HSTS: 2 Jahre + preload-Eligibility (63072000s = 2a).
  // "preload" signalisiert dass wir bereit sind auf der HSTS-Preload-Liste
  // zu stehen — das ist non-revocable, also nur wenn alle Subdomains HTTPS
  // nutzen (bei uns: backend, frontend, parse → alle TLS).
  newHeaders.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  // Cross-Origin-Opener-Policy: schützt vor Side-Channel-Attacks (Spectre).
  // same-origin-allow-popups erlaubt Whop-Checkout-Popups ohne die
  // Haupt-Origin mit dem Popup zu sharen.
  newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  // X-Permitted-Cross-Domain-Policies: legacy Flash/Adobe-Hardening.
  newHeaders.set('X-Permitted-Cross-Domain-Policies', 'none');

  // ─── Content Security Policy (HTML only) ───────────────────
  const ct = response.headers.get('content-type') || '';
  if (ct.includes('text/html')) {
    // Strenge CSP mit expliziten Quellen für alle eingebundenen Services.
    // Whop + Plausible + DiceBear + GA müssen erlaubt sein (siehe
    // BaseLayout.astro + ebook.astro). 'unsafe-inline' ist leider nötig
    // weil Astro inline-Scripts für set:html (Schema-JSON), Inline-Styles,
    // und Service-Worker-Registration nutzt. Ohne 'unsafe-inline' würde
    // die halbe Seite brechen — mit 'strict-dynamic' könnten wir das
    // mittelfristig lösen (nonce-basiert), aber das ist separate Welle.
    newHeaders.set('Content-Security-Policy',
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com https://cdn.jsdelivr.net https://plausible.io https://js.whop.com; " +
      "script-src-elem 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com https://cdn.jsdelivr.net https://plausible.io https://js.whop.com; " +
      "style-src 'self' 'unsafe-inline'; " +
      "style-src-elem 'self' 'unsafe-inline'; " +
      "img-src 'self' data: https: blob:; " +
      "font-src 'self' data:; " +
      "connect-src 'self' https://www.google-analytics.com https://analytics.google.com https://plausible.io https://api.dicebear.com https://js.whop.com https://api.whop.com https://be.xloves.com; " +
      "frame-src 'self' https://js.whop.com https://whop.com; " +
      "media-src 'self' data:; " +
      "worker-src 'self' blob:; " +
      "manifest-src 'self'; " +
      "object-src 'none'; " +
      "frame-ancestors 'none'; " +
      "base-uri 'self'; " +
      "form-action 'self' https://whop.com https://js.whop.com; " +
      "upgrade-insecure-requests;",
    );
    // Cache HTML für 5 Min (Preis-/Content-Änderungen sollen zügig sichtbar sein),
    // Stale-while-revalidate für 1h als Fallback.
    // Sales-/Checkout-Seiten: kürzer cachen, damit Änderungen schnell durchschlagen.
    const isCritical = path === '/ebook' || path === '/' || path.startsWith('/api/');
    if (isCritical) {
      newHeaders.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    } else {
      newHeaders.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
    }
  }

  // ─── Never cache the service worker or manifest ────────────
  // Without this, sw.js would get max-age=31536000 (matches the .js regex below)
  // and users would be stuck on an old SW until the browser's own 24h SW-refresh
  // heuristic kicks in. Same logic for manifest.json — changes to app metadata
  // must propagate within minutes, not days.
  if (path === '/sw.js' || path === '/manifest.json' || path === '/manifest.webmanifest') {
    newHeaders.set('Cache-Control', 'public, max-age=0, must-revalidate');
    newHeaders.delete('Expires');
  } else if (ct.includes('image/') || ct.includes('font/') || path.match(/\.(webp|jpg|jpeg|png|gif|svg|ico|woff2?|ttf|eot)$/i)) {
    // ─── Cache static assets aggressively ──────────────────────
    newHeaders.set('Cache-Control', 'public, max-age=31536000, immutable');
  } else if (ct.includes('text/css') || ct.includes('application/javascript') || path.match(/\.(css|js)$/i)) {
    newHeaders.set('Cache-Control', 'public, max-age=31536000, immutable');
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
});
