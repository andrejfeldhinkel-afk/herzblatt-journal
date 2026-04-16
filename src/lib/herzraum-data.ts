/**
 * Herzraum Data Layer
 *
 * JSON-basierte Persistenz (Railway-Filesystem ist ephemeral!).
 *
 * Format:
 *  - pageviews.json:     Array<{ ts, path, referrer, country }>
 *  - clicks.json:        Array<{ ts, target, type, source }>
 *  - newsletter.csv:     (bereits in data/ via newsletter.ts — CSV-Format)
 *  - registrations.json: Array<{ ts, email, source }>
 *  - sessions.json:      Admin-Sessions (siehe herzraum-auth.ts)
 *  - login-attempts.json: Rate-Limit (siehe herzraum-auth.ts)
 *  - daily-stats.json:   Cache der aggregierten Daily-Stats (1h TTL)
 */

import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.join(process.cwd(), 'data');

export function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function dataPath(file: string): string {
  return path.join(DATA_DIR, file);
}

/** Atomic JSON-Write: schreibt nach .tmp, dann rename. Verhindert korrupte Dateien. */
export function writeJSON<T>(file: string, data: T): void {
  ensureDataDir();
  const target = dataPath(file);
  const tmp = target + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, target);
}

export function readJSON<T>(file: string, fallback: T): T {
  ensureDataDir();
  const target = dataPath(file);
  if (!fs.existsSync(target)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(target, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

/** Append one entry to an array-JSON. Liest → hängt an → atomic-schreibt. */
export function appendJSON<T>(file: string, entry: T, maxLength: number = 100_000): void {
  const arr = readJSON<T[]>(file, []);
  arr.push(entry);
  // Cap: älteste Einträge werfen um nicht ins Unendliche zu wachsen
  const trimmed = arr.length > maxLength ? arr.slice(arr.length - maxLength) : arr;
  writeJSON(file, trimmed);
}

/* ══════════════════════════════════════════════════════════════════
 * Event-Typen
 * ═════════════════════════════════════════════════════════════════ */

export interface PageviewEvent {
  ts: string;          // ISO-Timestamp
  path: string;        // /blog/slug
  referrer: string;    // Referrer Host oder 'direct'
  ua?: string;         // User-Agent short
}

export interface ClickEvent {
  ts: string;
  target: string;      // xloves, michverlieben, ...
  source: string;      // Source-Page oder 'unknown'
  type?: string;       // 'affiliate' | 'quiz-result' | ...
}

export interface RegistrationEvent {
  ts: string;
  email: string;       // plain (für Admin-Export)
  source: string;
}

/* ══════════════════════════════════════════════════════════════════
 * Aggregations-Helpers
 * ═════════════════════════════════════════════════════════════════ */

/** ISO-Date (YYYY-MM-DD) aus Timestamp. */
export function toDateKey(ts: string): string {
  return ts.slice(0, 10);
}

/** Anfang des Tages in ms (lokale UTC). */
export function dayStartMs(daysAgo: number = 0): number {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime() - daysAgo * 86_400_000;
}

/** Summiert Count pro Tag. Füllt Lücken mit 0 auf. */
export function aggregateByDay<T extends { ts: string }>(
  events: T[],
  days: number
): { date: string; count: number }[] {
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  const days_arr: { date: string; count: number }[] = [];
  const map = new Map<string, number>();

  for (const e of events) {
    const day = toDateKey(e.ts);
    map.set(day, (map.get(day) || 0) + 1);
  }

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end.getTime() - i * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    days_arr.push({ date: key, count: map.get(key) || 0 });
  }
  return days_arr;
}

/** Group by any field; returns { [fieldValue]: count }. */
export function groupByField<T extends Record<string, any>>(
  events: T[],
  field: keyof T
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of events) {
    const key = String(e[field] ?? 'unknown');
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

/** Sortiert Record<string, number> → Top-N als [{key, count}]. */
export function getTopN(
  counts: Record<string, number>,
  n: number = 10
): { key: string; count: number }[] {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, count]) => ({ key, count }));
}

/** Filter auf Events der letzten N Tage. */
export function lastNDays<T extends { ts: string }>(events: T[], days: number): T[] {
  const cutoff = dayStartMs(days - 1);
  return events.filter((e) => new Date(e.ts).getTime() >= cutoff);
}

/** Filter auf heute. */
export function today<T extends { ts: string }>(events: T[]): T[] {
  const todayKey = new Date().toISOString().slice(0, 10);
  return events.filter((e) => toDateKey(e.ts) === todayKey);
}

/** Wochentag (0=Sun..6=Sat) → Label. */
export const DAY_LABELS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

/** Aggregiert Events nach Wochentag. */
export function byWeekday<T extends { ts: string }>(events: T[]): { day: string; count: number }[] {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const e of events) {
    counts[new Date(e.ts).getUTCDay()]++;
  }
  // Beginnend bei Mo statt So
  const ordered = [1, 2, 3, 4, 5, 6, 0];
  return ordered.map((i) => ({ day: DAY_LABELS[i], count: counts[i] }));
}

/** Aggregiert Events nach Stunde (0-23 UTC). */
export function byHour<T extends { ts: string }>(events: T[]): { hour: number; count: number }[] {
  const counts = new Array(24).fill(0);
  for (const e of events) {
    counts[new Date(e.ts).getUTCHours()]++;
  }
  return counts.map((count, hour) => ({ hour, count }));
}

/* ══════════════════════════════════════════════════════════════════
 * CSV-Reader für Newsletter (bestehende Datei aus newsletter.ts)
 * ═════════════════════════════════════════════════════════════════ */

export interface NewsletterEntry {
  timestamp: string;
  email: string;
  source: string;
  user_agent: string;
  ip_hash: string;
}

/** Sehr simpler CSV-Parser der die 5 Spalten der Newsletter-CSV lesen kann. */
export function readNewsletterCsv(): NewsletterEntry[] {
  const file = dataPath('subscribers.csv');
  if (!fs.existsSync(file)) return [];
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    const lines = raw.split('\n');
    // Skip header
    const out: NewsletterEntry[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      const parts = parseCsvLine(line);
      if (parts.length < 2) continue;
      out.push({
        timestamp: parts[0] || '',
        email: parts[1] || '',
        source: parts[2] || '',
        user_agent: parts[3] || '',
        ip_hash: parts[4] || '',
      });
    }
    return out;
  } catch {
    return [];
  }
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && inQuotes && line[i + 1] === '"') { current += '"'; i++; }
    else if (c === '"') inQuotes = !inQuotes;
    else if (c === ',' && !inQuotes) { result.push(current); current = ''; }
    else current += c;
  }
  result.push(current);
  return result;
}

/** Maskiert E-Mail-Adressen für UI: a***@gmail.com */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  const first = local.slice(0, 1);
  return `${first}***@${domain}`;
}
