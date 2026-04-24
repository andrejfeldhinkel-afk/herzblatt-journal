export const prerender = false;

import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

/**
 * /api/herzraum/articles/search?q=xyz
 *
 * Frontend-SSR-Endpoint (kein Backend-Call) für die Cmd+K-Quick-Search im
 * Admin. Nutzt Astro-Content-Collection direkt — wesentlich schneller als
 * über GitHub-Contents-API alle Files einzeln abzuholen.
 *
 * Response-Format:
 *   { ok: true, total: number, articles: [{slug, title, description, author, pubDate}] }
 *
 * Filter:
 *   q       — Case-insensitive substring match auf Titel + Slug + Tags
 *   limit   — max. Results (default 50, max 200)
 *
 * Keine Pagination — der Admin hat ≈1800 Artikel, 50 Treffer reichen für
 * die Search-Box, und die Collection ist in-memory günstig.
 */
export const GET: APIRoute = async ({ url }) => {
  const q = (url.searchParams.get('q') || '').trim().toLowerCase();
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10) || 50));

  try {
    const blog = await getCollection('blog');

    // Artikel auf schlanke Form reduzieren für Transport
    let items = blog.map((a) => {
      const data = a.data as Record<string, unknown>;
      return {
        slug: a.slug,
        title: String(data.title || ''),
        description: typeof data.description === 'string' ? data.description.slice(0, 200) : '',
        author: String(data.author || ''),
        pubDate: data.pubDate instanceof Date
          ? data.pubDate.toISOString().slice(0, 10)
          : (typeof data.pubDate === 'string' ? data.pubDate.slice(0, 10) : ''),
        tags: Array.isArray(data.tags) ? (data.tags as string[]).slice(0, 8) : [],
      };
    });

    if (q) {
      items = items.filter((a) => {
        const hay = (a.title + ' ' + a.slug + ' ' + a.tags.join(' ')).toLowerCase();
        if (hay.includes(q)) return true;
        // fuzzy: alle Query-Chars in Reihenfolge im Titel
        let qi = 0;
        for (let i = 0; i < hay.length && qi < q.length; i++) {
          if (hay[i] === q[qi]) qi++;
        }
        return qi === q.length;
      });
    }

    // Sortieren: exakte Title-Matches zuerst, dann Slug-Matches, dann Rest
    if (q) {
      items.sort((a, b) => {
        const aT = a.title.toLowerCase().includes(q) ? 0 : 1;
        const bT = b.title.toLowerCase().includes(q) ? 0 : 1;
        if (aT !== bT) return aT - bT;
        const aS = a.slug.toLowerCase().includes(q) ? 0 : 1;
        const bS = b.slug.toLowerCase().includes(q) ? 0 : 1;
        if (aS !== bS) return aS - bS;
        return (b.pubDate || '').localeCompare(a.pubDate || '');
      });
    } else {
      // Ohne Query: neueste zuerst
      items.sort((a, b) => (b.pubDate || '').localeCompare(a.pubDate || ''));
    }

    const total = items.length;
    items = items.slice(0, limit);

    return new Response(
      JSON.stringify({ ok: true, total, articles: items }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=60' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: String(err instanceof Error ? err.message : err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};
