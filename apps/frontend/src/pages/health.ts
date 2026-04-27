// Public-Health-Endpoint für Railway-Healthcheck.
//
// Antwortet sofort, OHNE DB / Backend-Calls / Content-Collection.
// Wird vom Railway-Deploy als healthcheckPath in railway.json referenziert.
// Default-Heartbeat-Window war zu kurz für Astro-SSR-Boot mit 1983+ Markdown-
// Files in der content-collection — siehe failed Deploy von PR #134.
//
// Mit dieser Route + healthcheckTimeout=300 hat der Container 5 Min Zeit
// zum Boot bevor Railway als unhealthy markiert.

export const prerender = false;

import type { APIRoute } from 'astro';

export const GET: APIRoute = () => {
  return new Response(
    JSON.stringify({ ok: true, ts: new Date().toISOString() }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, max-age=0',
      },
    },
  );
};
