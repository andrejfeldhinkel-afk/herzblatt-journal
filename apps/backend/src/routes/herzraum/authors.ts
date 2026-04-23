/**
 * /herzraum/authors — CRUD für Autoren über TypeScript-File (authors.ts).
 *
 * Autoren leben in `apps/frontend/src/data/authors.ts` als Record<slug, Author>.
 * Wir parsen/rewriten dieses File via GitHub-API.
 *
 * Endpoints (session-auth):
 *   GET  /herzraum/authors          → Liste aller Autoren
 *   GET  /herzraum/authors/:slug    → einzelner Autor
 *   PUT  /herzraum/authors/:slug    → Update (vollständiges Objekt)
 *   POST /herzraum/authors          → neuen Autor anlegen
 *   DELETE /herzraum/authors/:slug  → löschen (prüft: keine Artikel referenzieren)
 */
import { Hono } from 'hono';
import { z } from 'zod';
import JSON5 from 'json5';
import { logAudit } from '../../lib/audit.js';

const app = new Hono();

const GH_API = 'https://api.github.com';
const AUTHORS_PATH = 'apps/frontend/src/data/authors.ts';

function getGitHubConfig() {
  return {
    token: process.env.GITHUB_TOKEN || '',
    owner: process.env.GITHUB_OWNER || 'andrejfeldhinkel-afk',
    repo: process.env.GITHUB_REPO || 'herzblatt-journal',
    branch: process.env.GITHUB_BRANCH || 'main',
  };
}

async function ghGetFile(path: string): Promise<{ content: string; sha: string } | null> {
  const cfg = getGitHubConfig();
  if (!cfg.token) return null;
  const url = `${GH_API}/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIComponent(path)}?ref=${cfg.branch}`;
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${cfg.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as any;
  return {
    content: Buffer.from(data.content || '', 'base64').toString('utf8'),
    sha: data.sha,
  };
}

async function ghUpdateFile(path: string, content: string, sha: string, message: string) {
  const cfg = getGitHubConfig();
  const url = `${GH_API}/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIComponent(path)}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${cfg.token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      message,
      branch: cfg.branch,
      content: Buffer.from(content, 'utf8').toString('base64'),
      sha,
      committer: { name: 'Herzraum Admin', email: 'admin@herzblatt-journal.de' },
    }),
  });
  if (!res.ok) {
    return { ok: false, error: `GitHub ${res.status}: ${await res.text().catch(() => '')}` };
  }
  const data = (await res.json().catch(() => ({}))) as any;
  return { ok: true, commitUrl: data?.commit?.html_url };
}

interface Author {
  name: string;
  slug: string;
  role: string;
  bio: string;
  shortBio: string;
  image: string;
  expertise: string[];
  credentials?: string[];
  yearsExperience?: number;
  socialUrls?: string[];
  knowsAbout?: string[];
  alumniOf?: string;
}

/**
 * Extrahiert Autoren aus der TS-Source via JSON-eval.
 * Pragmatisch: wir extrahieren den Object-Literal-Bereich zwischen
 * `export const authors: Record<string, Author> = {` und dem matching `};`
 * und evaluieren ihn als JSON (nach escape der String-Literals).
 */
function parseAuthorsSource(src: string): Record<string, Author> {
  // Finde den Start des authors-Objekts
  const startMatch = src.match(/export\s+const\s+authors\s*:\s*Record<[^>]+>\s*=\s*\{/);
  if (!startMatch) throw new Error('authors-declaration not found');
  const startIdx = startMatch.index! + startMatch[0].length;

  // Finde matching closing `}` mit Depth-Counting
  let depth = 1;
  let i = startIdx;
  while (i < src.length && depth > 0) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    if (depth === 0) break;
    i++;
  }
  if (depth !== 0) throw new Error('unbalanced braces in authors');
  const body = src.substring(startIdx, i).trim();

  // Vorher: `new Function(\`return {${body}};\`)()` — war zwar nur für
  // Repo-interne authors.ts, aber klassischer Trust-Boundary-Smell.
  // JSON5 akzeptiert TS-Object-Literale (unquoted keys, trailing commas,
  // Kommentare, single-quoted strings) und macht KEINE Code-Ausführung.
  try {
    return JSON5.parse<Record<string, Author>>(`{${body}}`);
  } catch (err) {
    throw new Error('parse-failed: ' + String(err));
  }
}

function serializeAuthorsFile(authors: Record<string, Author>): string {
  const esc = (s: string) =>
    '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';

  const arrStr = (arr?: string[]) =>
    arr && arr.length > 0 ? '[' + arr.map(esc).join(', ') + ']' : undefined;

  const lines: string[] = [];
  lines.push('export interface Author {');
  lines.push('  name: string;');
  lines.push('  slug: string;');
  lines.push('  role: string;');
  lines.push('  bio: string;');
  lines.push('  shortBio: string;');
  lines.push('  image: string;');
  lines.push('  expertise: string[];');
  lines.push('  credentials?: string[];');
  lines.push('  yearsExperience?: number;');
  lines.push('  socialUrls?: string[];');
  lines.push('  knowsAbout?: string[];');
  lines.push('  alumniOf?: string;');
  lines.push('}');
  lines.push('');
  lines.push('export const authors: Record<string, Author> = {');

  for (const [slug, a] of Object.entries(authors)) {
    lines.push(`  ${esc(slug)}: {`);
    lines.push(`    name: ${esc(a.name)},`);
    lines.push(`    slug: ${esc(a.slug)},`);
    lines.push(`    role: ${esc(a.role)},`);
    lines.push(`    bio: ${esc(a.bio)},`);
    lines.push(`    shortBio: ${esc(a.shortBio)},`);
    lines.push(`    image: ${esc(a.image)},`);
    if (a.expertise) lines.push(`    expertise: ${arrStr(a.expertise)},`);
    if (a.credentials) lines.push(`    credentials: ${arrStr(a.credentials)},`);
    if (a.yearsExperience !== undefined) lines.push(`    yearsExperience: ${a.yearsExperience},`);
    if (a.socialUrls) lines.push(`    socialUrls: ${arrStr(a.socialUrls)},`);
    if (a.knowsAbout) lines.push(`    knowsAbout: ${arrStr(a.knowsAbout)},`);
    if (a.alumniOf) lines.push(`    alumniOf: ${esc(a.alumniOf)},`);
    lines.push('  },');
  }
  lines.push('};');
  return lines.join('\n') + '\n';
}

// ─── Endpoints ───────────────────────────────────────────────

app.get('/', async (c) => {
  const file = await ghGetFile(AUTHORS_PATH);
  if (!file) return c.json({ ok: false, error: 'file-not-found' }, 404);
  try {
    const authors = parseAuthorsSource(file.content);
    return c.json({
      ok: true,
      sha: file.sha,
      authors,
      count: Object.keys(authors).length,
    });
  } catch (err) {
    return c.json({ ok: false, error: String(err) }, 500);
  }
});

app.get('/:slug', async (c) => {
  const slug = c.req.param('slug');
  const file = await ghGetFile(AUTHORS_PATH);
  if (!file) return c.json({ ok: false, error: 'file-not-found' }, 404);
  try {
    const authors = parseAuthorsSource(file.content);
    if (!authors[slug]) return c.json({ ok: false, error: 'not-found' }, 404);
    return c.json({ ok: true, sha: file.sha, author: authors[slug] });
  } catch (err) {
    return c.json({ ok: false, error: String(err) }, 500);
  }
});

const authorSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().regex(/^[a-z0-9-]{2,60}$/),
  role: z.string().min(2).max(200),
  bio: z.string().min(50).max(3000),
  shortBio: z.string().min(20).max(500),
  image: z.string().min(5).max(200),
  expertise: z.array(z.string().min(1).max(80)).max(30),
  credentials: z.array(z.string().max(200)).max(20).optional(),
  yearsExperience: z.number().int().min(0).max(80).optional(),
  socialUrls: z.array(z.string().url()).max(10).optional(),
  knowsAbout: z.array(z.string().min(1).max(100)).max(30).optional(),
  alumniOf: z.string().max(200).optional(),
});

app.put('/:slug', async (c) => {
  const slug = c.req.param('slug');
  let body: unknown;
  try { body = await c.req.json(); }
  catch { return c.json({ ok: false, error: 'invalid-json' }, 400); }

  const parsed = authorSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'validation', issues: parsed.error.issues }, 400);
  }
  if (parsed.data.slug !== slug) {
    return c.json({ ok: false, error: 'slug-mismatch' }, 400);
  }

  const file = await ghGetFile(AUTHORS_PATH);
  if (!file) return c.json({ ok: false, error: 'file-not-found' }, 404);

  let authors: Record<string, Author>;
  try { authors = parseAuthorsSource(file.content); }
  catch (err) { return c.json({ ok: false, error: String(err) }, 500); }

  if (!authors[slug]) return c.json({ ok: false, error: 'not-found' }, 404);

  authors[slug] = parsed.data as Author;
  const newSrc = serializeAuthorsFile(authors);
  const res = await ghUpdateFile(AUTHORS_PATH, newSrc, file.sha, `author: update ${slug}`);
  if (!res.ok) return c.json({ ok: false, error: res.error }, 500);

  void logAudit(c, { action: 'author.update', target: slug, meta: { commitUrl: res.commitUrl } });

  return c.json({ ok: true, slug, commitUrl: res.commitUrl, estimatedLiveIn: '~5-7 Min' });
});

app.post('/', async (c) => {
  let body: unknown;
  try { body = await c.req.json(); }
  catch { return c.json({ ok: false, error: 'invalid-json' }, 400); }

  const parsed = authorSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'validation', issues: parsed.error.issues }, 400);
  }

  const file = await ghGetFile(AUTHORS_PATH);
  if (!file) return c.json({ ok: false, error: 'file-not-found' }, 404);

  let authors: Record<string, Author>;
  try { authors = parseAuthorsSource(file.content); }
  catch (err) { return c.json({ ok: false, error: String(err) }, 500); }

  if (authors[parsed.data.slug]) {
    return c.json({ ok: false, error: 'slug-exists' }, 409);
  }
  authors[parsed.data.slug] = parsed.data as Author;
  const newSrc = serializeAuthorsFile(authors);
  const res = await ghUpdateFile(AUTHORS_PATH, newSrc, file.sha, `author: create ${parsed.data.slug}`);
  if (!res.ok) return c.json({ ok: false, error: res.error }, 500);

  void logAudit(c, { action: 'author.create', target: parsed.data.slug, meta: { commitUrl: res.commitUrl } });
  return c.json({ ok: true, slug: parsed.data.slug, commitUrl: res.commitUrl });
});

export default app;
