import { defineMiddleware } from 'astro:middleware';

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

export const onRequest = defineMiddleware(async (context, next) => {
  const { request, redirect } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, '') || '/';

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

  const response = await next();

  // If a /tags/* page returns 404, redirect to /tags/ instead
  if (response.status === 404 && path.startsWith('/tags/') && path !== '/tags') {
    return redirect('/tags/', 302);
  }

  // ─── Security Headers (all responses) ──────────────────────
  const newHeaders = new Headers(response.headers);
  newHeaders.set('X-Content-Type-Options', 'nosniff');
  newHeaders.set('X-Frame-Options', 'SAMEORIGIN');
  newHeaders.set('X-XSS-Protection', '1; mode=block');
  newHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  newHeaders.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  newHeaders.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  // ─── Content Security Policy (HTML only) ───────────────────
  const ct = response.headers.get('content-type') || '';
  if (ct.includes('text/html')) {
    newHeaders.set('Content-Security-Policy',
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com; " +
      "style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: https: blob:; " +
      "font-src 'self'; " +
      "connect-src 'self' https://www.google-analytics.com https://analytics.google.com https://be.xloves.com; " +
      "frame-ancestors 'none'; " +
      "base-uri 'self'; " +
      "form-action 'self';"
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

  // ─── Cache static assets aggressively ──────────────────────
  if (ct.includes('image/') || ct.includes('font/') || path.match(/\.(webp|jpg|jpeg|png|gif|svg|ico|woff2?|ttf|eot)$/i)) {
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
