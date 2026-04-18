/**
 * GET /herzraum/redirects
 * Liefert alle Redirects aus astro.config.mjs + src/middleware.ts (read-only).
 *
 * Schreibende Operationen sind NICHT implementiert — Redirects werden
 * weiterhin im Code gepflegt (per PR). Dieser Endpoint dient nur der
 * Übersicht im Dashboard.
 */
import { Hono } from 'hono';

const app = new Hono();

const GH_API = 'https://api.github.com';

async function ghFetchRawText(path: string): Promise<string | null> {
  const owner = process.env.GITHUB_OWNER || 'andrejfeldhinkel-afk';
  const repo = process.env.GITHUB_REPO || 'herzblatt-journal';
  const branch = process.env.GITHUB_BRANCH || 'main';
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return await res.text();
}

interface Redirect {
  from: string;
  to: string;
  status: number;
  source: 'astro.config.mjs' | 'middleware.ts';
}

function parseAstroRedirects(text: string): Redirect[] {
  const results: Redirect[] = [];
  // Format: '/some/path': { status: 301, destination: '/other/path' }
  const re = /'([^']+)'\s*:\s*\{\s*status:\s*(\d+)\s*,\s*destination:\s*'([^']+)'\s*\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    results.push({ from: m[1], to: m[3], status: Number(m[2]), source: 'astro.config.mjs' });
  }
  return results;
}

function parseMiddlewareRedirects(text: string): Redirect[] {
  const results: Redirect[] = [];
  // Format: '/some/path': '/other/path'
  //     inside `const redirects: Record<string, string> = { ... };`
  const block = text.match(/const\s+redirects\s*:\s*Record<[^>]+>\s*=\s*\{([\s\S]*?)\};/);
  if (!block) return results;
  const inner = block[1];
  const re = /'([^']+)'\s*:\s*'([^']+)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner)) !== null) {
    results.push({ from: m[1], to: m[2], status: 301, source: 'middleware.ts' });
  }
  return results;
}

app.get('/', async (c) => {
  const [astroText, middlewareText] = await Promise.all([
    ghFetchRawText('apps/frontend/astro.config.mjs'),
    ghFetchRawText('apps/frontend/src/middleware.ts'),
  ]);

  const astroRedirects = astroText ? parseAstroRedirects(astroText) : [];
  const middlewareRedirects = middlewareText ? parseMiddlewareRedirects(middlewareText) : [];

  const all = [...astroRedirects, ...middlewareRedirects];

  // Gruppiere nach source
  return c.json({
    ok: true,
    total: all.length,
    astroConfigCount: astroRedirects.length,
    middlewareCount: middlewareRedirects.length,
    redirects: all,
  });
});

export default app;
