export const prerender = false;

import type { APIRoute } from 'astro';
import { readJSON, lastNDays, groupByField, getTopN, type ClickEvent } from '../../../../lib/herzraum-data';

export const GET: APIRoute = async ({ url }) => {
  try {
    const days = Number(url.searchParams.get('days') || '30');
    const clicks = readJSON<ClickEvent[]>('clicks.json', []);
    const recent = lastNDays(clicks, days);
    const grouped = groupByField(recent, 'source');
    const sources = getTopN(grouped, 25).map((e) => ({ source: e.key, count: e.count }));
    return new Response(JSON.stringify({ ok: true, sources }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ ok: false }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
