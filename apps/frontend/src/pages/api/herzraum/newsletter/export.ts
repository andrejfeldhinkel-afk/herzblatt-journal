export const prerender = false;

import type { APIRoute } from 'astro';
import { readNewsletterCsv } from '../../../../lib/herzraum-data';

/** CSV-Export für externes Newsletter-Tool — volle E-Mails. */
export const GET: APIRoute = async () => {
  const entries = readNewsletterCsv();
  const lines = ['email,timestamp,source'];
  for (const e of entries) {
    const escEmail = e.email.includes(',') ? '"' + e.email.replace(/"/g, '""') + '"' : e.email;
    const escSource = e.source.includes(',') ? '"' + e.source.replace(/"/g, '""') + '"' : e.source;
    lines.push(escEmail + ',' + e.timestamp + ',' + escSource);
  }
  return new Response(lines.join('\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="herzblatt-subscribers-' + new Date().toISOString().slice(0,10) + '.csv"',
      'Cache-Control': 'no-store',
    },
  });
};
