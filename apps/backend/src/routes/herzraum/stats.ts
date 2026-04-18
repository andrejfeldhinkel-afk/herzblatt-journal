import { Hono } from 'hono';
import { count, desc, gt, sql } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';

const app = new Hono();

function daysAgoDate(days: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return new Date(d.getTime() - days * 86_400_000);
}

app.get('/', async (c) => {
  const rangeParam = c.req.query('range') || '30d';
  const days = rangeParam === 'today' ? 1 : rangeParam === '7d' ? 7 : rangeParam === '90d' ? 90 : 30;

  const todayStart = daysAgoDate(0);
  const weekStart = daysAgoDate(7);
  const monthStart = daysAgoDate(30);
  const rangeStart = daysAgoDate(days);

  // KPIs (parallel)
  const [
    pvToday, pvWeek, pvMonth, pvTotal,
    clickToday, clickWeek, clickMonth, clickTotal,
    regToday, regWeek, regMonth, regTotal,
    nlToday, nlWeek, nlMonth, nlTotal,
  ] = await Promise.all([
    db.select({ n: count() }).from(schema.pageviews).where(gt(schema.pageviews.ts, todayStart)),
    db.select({ n: count() }).from(schema.pageviews).where(gt(schema.pageviews.ts, weekStart)),
    db.select({ n: count() }).from(schema.pageviews).where(gt(schema.pageviews.ts, monthStart)),
    db.select({ n: count() }).from(schema.pageviews),
    db.select({ n: count() }).from(schema.clicks).where(gt(schema.clicks.ts, todayStart)),
    db.select({ n: count() }).from(schema.clicks).where(gt(schema.clicks.ts, weekStart)),
    db.select({ n: count() }).from(schema.clicks).where(gt(schema.clicks.ts, monthStart)),
    db.select({ n: count() }).from(schema.clicks),
    db.select({ n: count() }).from(schema.registrations).where(gt(schema.registrations.createdAt, todayStart)),
    db.select({ n: count() }).from(schema.registrations).where(gt(schema.registrations.createdAt, weekStart)),
    db.select({ n: count() }).from(schema.registrations).where(gt(schema.registrations.createdAt, monthStart)),
    db.select({ n: count() }).from(schema.registrations),
    db.select({ n: count() }).from(schema.subscribers).where(gt(schema.subscribers.createdAt, todayStart)),
    db.select({ n: count() }).from(schema.subscribers).where(gt(schema.subscribers.createdAt, weekStart)),
    db.select({ n: count() }).from(schema.subscribers).where(gt(schema.subscribers.createdAt, monthStart)),
    db.select({ n: count() }).from(schema.subscribers),
  ]);

  // Top Articles (30d)
  const topArticles = await db
    .select({
      path: schema.pageviews.path,
      n: count().as('n'),
    })
    .from(schema.pageviews)
    .where(gt(schema.pageviews.ts, monthStart))
    .groupBy(schema.pageviews.path)
    .orderBy(desc(sql`n`))
    .limit(10);

  // Top Referrer (30d)
  const topReferrers = await db
    .select({
      referrer: schema.pageviews.referrer,
      n: count().as('n'),
    })
    .from(schema.pageviews)
    .where(gt(schema.pageviews.ts, monthStart))
    .groupBy(schema.pageviews.referrer)
    .orderBy(desc(sql`n`))
    .limit(10);

  // Top Click Targets (30d)
  const topClickTargets = await db
    .select({
      target: schema.clicks.target,
      n: count().as('n'),
    })
    .from(schema.clicks)
    .where(gt(schema.clicks.ts, monthStart))
    .groupBy(schema.clicks.target)
    .orderBy(desc(sql`n`))
    .limit(10);

  // Daily aggregates
  const pvByDayRaw = await db
    .select({
      day: sql<string>`to_char(${schema.pageviews.ts}, 'YYYY-MM-DD')`.as('day'),
      n: count().as('n'),
    })
    .from(schema.pageviews)
    .where(gt(schema.pageviews.ts, rangeStart))
    .groupBy(sql`day`)
    .orderBy(sql`day`);

  const clickByDayRaw = await db
    .select({
      day: sql<string>`to_char(${schema.clicks.ts}, 'YYYY-MM-DD')`.as('day'),
      n: count().as('n'),
    })
    .from(schema.clicks)
    .where(gt(schema.clicks.ts, rangeStart))
    .groupBy(sql`day`)
    .orderBy(sql`day`);

  function fillDays(rows: { day: string; n: number | string }[], days: number) {
    const map = new Map(rows.map(r => [r.day, Number(r.n)]));
    const out: { date: string; count: number }[] = [];
    const end = new Date();
    end.setUTCHours(0, 0, 0, 0);
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(end.getTime() - i * 86_400_000);
      const key = d.toISOString().slice(0, 10);
      out.push({ date: key, count: map.get(key) || 0 });
    }
    return out;
  }

  const pvByDay = fillDays(pvByDayRaw as any, days);
  const clicksByDay = fillDays(clickByDayRaw as any, days);

  // Pageviews by Weekday (0=Sonntag, 1=Montag, ..., 6=Samstag)
  const pvByWeekdayRaw = await db.execute<{ day: number; n: number }>(sql`
    SELECT EXTRACT(DOW FROM ts)::int AS day, COUNT(*)::int AS n
    FROM pageviews
    WHERE ts > ${rangeStart.toISOString()}::timestamptz
    GROUP BY day
    ORDER BY day
  `);
  const weekdayLabels = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const weekdayMap = new Map<number, number>();
  for (const row of (pvByWeekdayRaw as any[])) {
    weekdayMap.set(Number(row.day), Number(row.n));
  }
  const pvByWeekday = weekdayLabels.map((day, i) => ({ day, count: weekdayMap.get(i) || 0 }));

  // Pageviews by Hour (0-23)
  const pvByHourRaw = await db.execute<{ hour: number; n: number }>(sql`
    SELECT EXTRACT(HOUR FROM ts)::int AS hour, COUNT(*)::int AS n
    FROM pageviews
    WHERE ts > ${rangeStart.toISOString()}::timestamptz
    GROUP BY hour
    ORDER BY hour
  `);
  const hourMap = new Map<number, number>();
  for (const row of (pvByHourRaw as any[])) {
    hourMap.set(Number(row.hour), Number(row.n));
  }
  const pvByHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: hourMap.get(h) || 0 }));

  // Registrations by Day
  const regByDayRaw = await db.execute<{ day: string; n: number }>(sql`
    SELECT DATE(created_at AT TIME ZONE 'UTC')::text AS day, COUNT(*)::int AS n
    FROM registrations
    WHERE created_at > ${rangeStart.toISOString()}::timestamptz
    GROUP BY day
    ORDER BY day
  `);
  const regByDay = fillDays(regByDayRaw as any, days);

  // Recent activity
  const recent = await db
    .select({
      ts: schema.pageviews.ts,
      path: schema.pageviews.path,
      referrer: schema.pageviews.referrer,
    })
    .from(schema.pageviews)
    .orderBy(desc(schema.pageviews.ts))
    .limit(20);

  const pvT = Number(pvTotal[0]?.n || 0);
  const clT = Number(clickTotal[0]?.n || 0);
  const ctr = pvT > 0 ? Math.round((clT / pvT) * 10000) / 100 : 0;

  return c.json({
    ok: true,
    range: rangeParam,
    days,
    kpis: {
      pageviews: {
        today: Number(pvToday[0]?.n || 0),
        week: Number(pvWeek[0]?.n || 0),
        month: Number(pvMonth[0]?.n || 0),
        total: pvT,
      },
      clicks: {
        today: Number(clickToday[0]?.n || 0),
        week: Number(clickWeek[0]?.n || 0),
        month: Number(clickMonth[0]?.n || 0),
        total: clT,
      },
      registrations: {
        today: Number(regToday[0]?.n || 0),
        week: Number(regWeek[0]?.n || 0),
        month: Number(regMonth[0]?.n || 0),
        total: Number(regTotal[0]?.n || 0),
      },
      newsletter: {
        today: Number(nlToday[0]?.n || 0),
        week: Number(nlWeek[0]?.n || 0),
        month: Number(nlMonth[0]?.n || 0),
        total: Number(nlTotal[0]?.n || 0),
      },
    },
    topArticles: topArticles.map(a => ({ slug: a.path, count: Number(a.n) })),
    topReferrers: topReferrers.map(r => ({ key: r.referrer || 'direct', count: Number(r.n) })),
    topClickTargets: topClickTargets.map(t => ({ key: t.target, count: Number(t.n) })),
    charts: {
      pageviewsByDay: pvByDay,
      clicksByDay,
      pageviewsByWeekday: pvByWeekday,
      pageviewsByHour: pvByHour,
      registrationsByDay: regByDay,
    },
    recentActivity: recent.map(r => ({
      ts: r.ts instanceof Date ? r.ts.toISOString() : r.ts,
      path: r.path,
      referrer: r.referrer || 'direct',
    })),
    ctr,
  });
});

export default app;
