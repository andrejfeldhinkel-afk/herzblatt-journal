export const prerender = false;

import type { APIRoute } from 'astro';
import {
  readJSON,
  readNewsletterCsv,
  lastNDays,
  today,
  aggregateByDay,
  groupByField,
  getTopN,
  byWeekday,
  byHour,
  type PageviewEvent,
  type ClickEvent,
  type RegistrationEvent,
} from '../../../lib/herzraum-data';

/**
 * Zentrale Stats-API für das Dashboard.
 * Auth: wird durch Middleware via /api/herzraum/* geschützt.
 *
 * Query-Params:
 *  - range: 'today' | '7d' | '30d' | '90d'  (default '30d')
 *  - section: Optional, nur bestimmten Abschnitt laden
 */

export const GET: APIRoute = async ({ url }) => {
  try {
    const range = url.searchParams.get('range') || '30d';
    const days = range === 'today' ? 1 : range === '7d' ? 7 : range === '90d' ? 90 : 30;

    // ── Rohdaten laden ────────────────────────────────────────
    const pageviews = readJSON<PageviewEvent[]>('pageviews.json', []);
    const clicks = readJSON<ClickEvent[]>('clicks.json', []);
    const registrations = readJSON<RegistrationEvent[]>('registrations.json', []);
    const newsletter = readNewsletterCsv();

    // ── Zeiträume ─────────────────────────────────────────────
    const pvToday = today(pageviews);
    const pv7 = lastNDays(pageviews, 7);
    const pv30 = lastNDays(pageviews, 30);

    const clickToday = today(clicks);
    const click7 = lastNDays(clicks, 7);
    const click30 = lastNDays(clicks, 30);

    const regToday = today(registrations);
    const reg7 = lastNDays(registrations, 7);
    const reg30 = lastNDays(registrations, 30);

    const nlToday = newsletter.filter((e) => e.timestamp.slice(0, 10) === new Date().toISOString().slice(0, 10));
    const nl7 = newsletter.filter((e) => new Date(e.timestamp).getTime() >= Date.now() - 7 * 86_400_000);
    const nl30 = newsletter.filter((e) => new Date(e.timestamp).getTime() >= Date.now() - 30 * 86_400_000);

    // ── KPIs ──────────────────────────────────────────────────
    const kpis = {
      pageviews: {
        today: pvToday.length,
        week: pv7.length,
        month: pv30.length,
        total: pageviews.length,
      },
      clicks: {
        today: clickToday.length,
        week: click7.length,
        month: click30.length,
        total: clicks.length,
      },
      newsletter: {
        today: nlToday.length,
        week: nl7.length,
        month: nl30.length,
        total: newsletter.length,
      },
      registrations: {
        today: regToday.length,
        week: reg7.length,
        month: reg30.length,
        total: registrations.length,
      },
    };

    // ── Charts: Pageviews pro Tag ─────────────────────────────
    const pvByDay = aggregateByDay(lastNDays(pageviews, days), days);

    // ── Top Artikel (30d) ────────────────────────────────────
    const pvBySlug = groupByField(pv30, 'path');
    const topArticles = getTopN(pvBySlug, 10).map((e) => ({
      slug: e.key,
      count: e.count,
    }));

    // ── Top Referrer (30d) ───────────────────────────────────
    const refCounts = groupByField(pv30, 'referrer');
    const topReferrers = getTopN(refCounts, 10);

    // ── Recent Activity (letzte 20 Pageviews) ────────────────
    const recentActivity = pageviews.slice(-20).reverse().map((e) => ({
      ts: e.ts,
      path: e.path,
      referrer: e.referrer,
    }));

    // ── Clicks: By Target ────────────────────────────────────
    const clicksByTarget = groupByField(click30, 'target');
    const topClickTargets = getTopN(clicksByTarget, 10);

    // ── Traffic: Wochentag / Stunde ───────────────────────────
    const pvByWeekday = byWeekday(pv30);
    const pvByHour = byHour(pv30);

    // ── CTR (Klicks / Pageviews) ──────────────────────────────
    const ctr = pageviews.length > 0
      ? (clicks.length / pageviews.length) * 100
      : 0;

    return new Response(
      JSON.stringify({
        ok: true,
        range,
        days,
        kpis,
        charts: {
          pageviewsByDay: pvByDay,
          pageviewsByWeekday: pvByWeekday,
          pageviewsByHour: pvByHour,
          clicksByDay: aggregateByDay(lastNDays(clicks, days), days),
          clicksByTarget,
          registrationsByDay: aggregateByDay(lastNDays(registrations, days), days),
          newsletterByDay: (() => {
            const windowEvents = nl30.map((e) => ({ ts: e.timestamp }));
            return aggregateByDay(windowEvents, days);
          })(),
        },
        topArticles,
        topReferrers,
        topClickTargets,
        recentActivity,
        ctr: Math.round(ctr * 100) / 100,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
