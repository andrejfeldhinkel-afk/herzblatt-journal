/**
 * In-memory Rate-Limiter.
 * Key: IP-Hash. State lebt pro Container-Instanz (bei Redeploy reset).
 * Akzeptabel für single-instance Railway-Deploy. Redis später bei Multi-Instance.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

// Auto-cleanup stale buckets every 5 min
setInterval(() => {
  const now = Date.now();
  for (const [key, b] of buckets) {
    if (now > b.resetAt) buckets.delete(key);
  }
}, CLEANUP_INTERVAL_MS);

/**
 * Gibt true zurück wenn Anfrage OK ist (innerhalb Limit).
 * windowMs: Zeitfenster in ms. max: erlaubte Requests in diesem Fenster.
 */
export function allowRequest(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  b.count++;
  return b.count <= max;
}

/**
 * Shared rate-limit: 60 Requests pro Minute pro IP über alle Public-API-Endpoints.
 * Separat pro Endpoint wäre granularer, aber YAGNI für den Start.
 */
export function allowPublicApi(ipHash: string): boolean {
  return allowRequest(ipHash, 60, 60_000);
}
