export const prerender = false;

import type { APIRoute } from 'astro';
import { readNewsletterCsv, maskEmail } from '../../../../lib/herzraum-data';

/**
 * Liefert die Newsletter-Liste für das Dashboard.
 * Default: maskierte E-Mails. Mit ?mask=false vollständige E-Mails (für CSV-Export im Admin).
 */
export const GET: APIRoute = async ({ url }) => {
  const mask = url.searchParams.get('mask') !== 'false';
  const entries = readNewsletterCsv();
  const result = entries.map((e) => ({
    email: mask ? maskEmail(e.email) : e.email,
    ts: e.timestamp,
    source: e.source,
  }));
  return new Response(JSON.stringify({ ok: true, entries: result, total: result.length }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};
