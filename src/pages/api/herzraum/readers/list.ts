export const prerender = false;

import type { APIRoute } from 'astro';
import { readJSON, readNewsletterCsv, maskEmail, type RegistrationEvent } from '../../../../lib/herzraum-data';

export const GET: APIRoute = async ({ url }) => {
  const mask = url.searchParams.get('mask') !== 'false';
  const regs = readJSON<RegistrationEvent[]>('registrations.json', []);
  const newsletter = readNewsletterCsv();
  const nlEmails = new Set(newsletter.map((e) => e.email.toLowerCase()));

  const entries = regs.map((r) => ({
    email: mask ? maskEmail(r.email) : r.email,
    ts: r.ts,
    source: r.source,
    newsletter: nlEmails.has(r.email.toLowerCase()),
  }));

  const overlap = regs.filter((r) => nlEmails.has(r.email.toLowerCase())).length;

  return new Response(JSON.stringify({ ok: true, entries, total: regs.length, overlap }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};
