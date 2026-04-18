/**
 * /herzraum/articles — Article-Create/Edit via GitHub-API.
 *
 * Session-Cookie-Auth (vom /herzraum/* Middleware-Mount erledigt).
 *
 * Architektur-Notiz:
 * Railway-FS ist ephemer. Wir SCHREIBEN Artikel deshalb direkt ins
 * GitHub-Repo (main-branch) via GitHub-Contents-API. Railway pickt die
 * Änderung auto auf und deployt das Frontend neu (~7 min).
 *
 * Endpoints:
 *   GET  /herzraum/articles/check-slug?slug=xxx  → { available, conflict? }
 *   POST /herzraum/articles                       → Body: { frontmatter, body }
 *                                                    → commits file, returns URL
 *
 * ENV-Vars (Backend):
 *   GITHUB_TOKEN   — PAT mit contents:write auf andrejfeldhinkel-afk/herzblatt-journal
 *   GITHUB_OWNER   — default: andrejfeldhinkel-afk
 *   GITHUB_REPO    — default: herzblatt-journal
 *   GITHUB_BRANCH  — default: main
 */
import { Hono } from 'hono';
import { z } from 'zod';

const app = new Hono();

const GH_API = 'https://api.github.com';

function getGitHubConfig() {
  return {
    token: process.env.GITHUB_TOKEN || '',
    owner: process.env.GITHUB_OWNER || 'andrejfeldhinkel-afk',
    repo: process.env.GITHUB_REPO || 'herzblatt-journal',
    branch: process.env.GITHUB_BRANCH || 'main',
  };
}

const VALID_SLUG = /^[a-z0-9][a-z0-9-]{2,80}$/;
const ARTICLES_PATH = 'apps/frontend/src/content/blog';

async function ghContentExists(path: string): Promise<boolean> {
  const cfg = getGitHubConfig();
  const url = `${GH_API}/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIComponent(path)}?ref=${cfg.branch}`;
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${cfg.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  return res.status === 200;
}

async function ghFetchRawText(path: string): Promise<string | null> {
  const cfg = getGitHubConfig();
  const url = `https://raw.githubusercontent.com/${cfg.owner}/${cfg.repo}/${cfg.branch}/${path}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return await res.text();
}

async function ghCreateFile(
  path: string,
  contentUtf8: string,
  commitMessage: string,
): Promise<{ ok: boolean; error?: string; commitUrl?: string; fileUrl?: string }> {
  const cfg = getGitHubConfig();
  if (!cfg.token) return { ok: false, error: 'GITHUB_TOKEN not set' };

  const body = {
    message: commitMessage,
    branch: cfg.branch,
    content: Buffer.from(contentUtf8, 'utf8').toString('base64'),
    committer: {
      name: 'Herzraum Admin',
      email: 'admin@herzblatt-journal.de',
    },
  };

  const url = `${GH_API}/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIComponent(path)}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${cfg.token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    return { ok: false, error: `GitHub ${res.status}: ${errText}` };
  }

  const data = (await res.json().catch(() => ({}))) as any;
  return {
    ok: true,
    commitUrl: data?.commit?.html_url,
    fileUrl: data?.content?.html_url,
  };
}

/**
 * Parst `redirects`-Keys aus astro.config.mjs.
 * Wir laden das File via raw.githubusercontent.com und regex'n die `/blog/{slug}`-keys raus.
 */
async function loadRedirectSlugs(): Promise<Set<string>> {
  const text = await ghFetchRawText('apps/frontend/astro.config.mjs');
  if (!text) return new Set();

  const slugs = new Set<string>();
  // Matches Zeilen wie:  '/blog/some-slug': { status: 301, ...
  //                  oder  '/some-slug': { status: 301, destination: '/blog/...'
  const re = /'\/(?:blog\/)?([a-z0-9-]+)'\s*:\s*\{\s*status:\s*301/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    slugs.add(m[1]);
  }
  return slugs;
}

// ─── Endpoints ─────────────────────────────────────────────────

/**
 * GET /herzraum/articles/check-slug?slug=xxx
 * Prüft Slug-Verfügbarkeit gegen:
 *   - Format-Regex
 *   - Bestehende Artikel in GitHub
 *   - Redirects in astro.config.mjs
 */
app.get('/check-slug', async (c) => {
  const slug = (c.req.query('slug') || '').trim().toLowerCase();
  if (!slug) return c.json({ available: false, reason: 'empty slug' }, 400);
  if (!VALID_SLUG.test(slug)) {
    return c.json({ available: false, reason: 'invalid format (a-z, 0-9, hyphens; 3-80 chars)' });
  }

  const cfg = getGitHubConfig();
  if (!cfg.token) {
    return c.json({ available: false, reason: 'GITHUB_TOKEN not configured' }, 500);
  }

  const filePath = `${ARTICLES_PATH}/${slug}.md`;
  const [articleExists, redirectSlugs] = await Promise.all([
    ghContentExists(filePath),
    loadRedirectSlugs(),
  ]);

  if (articleExists) {
    return c.json({
      available: false,
      reason: 'article-exists',
      conflict: { type: 'article', url: `https://herzblatt-journal.com/blog/${slug}` },
    });
  }
  if (redirectSlugs.has(slug)) {
    return c.json({
      available: false,
      reason: 'redirect-exists',
      conflict: { type: 'redirect', note: 'Slug ist bereits als Redirect definiert' },
    });
  }

  return c.json({ available: true, slug });
});

// ─── Article-Create ──────────────────────────────────────────

const faqSchema = z.object({
  question: z.string().min(1).max(300),
  answer: z.string().min(1).max(2000),
});

const frontmatterSchema = z.object({
  title: z.string().min(8).max(200),
  description: z.string().min(50).max(300),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tags: z.array(z.string().min(1).max(50)).max(15).default([]),
  image: z.string().min(5).max(200).optional(),
  imageAlt: z.string().max(200).optional(),
  keywords: z.array(z.string().min(1).max(50)).max(30).default([]),
  featured: z.boolean().default(false),
  author: z.string().min(1).max(50),
  faq: z.array(faqSchema).max(20).default([]),
});

const createSchema = z.object({
  slug: z.string().regex(VALID_SLUG, 'slug format'),
  frontmatter: frontmatterSchema,
  body: z.string().min(500, 'body too short (<500 chars)').max(100_000),
  commitMessage: z.string().max(500).optional(),
});

/**
 * Escape für YAML-Strings mit doppelten Anführungszeichen.
 */
function yamlQuote(s: string): string {
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

function buildFrontmatter(fm: z.infer<typeof frontmatterSchema>): string {
  const lines: string[] = ['---'];
  lines.push(`title: ${yamlQuote(fm.title)}`);
  lines.push(`description: ${yamlQuote(fm.description)}`);
  lines.push(`date: ${fm.date}`);
  lines.push(`author: ${yamlQuote(fm.author)}`);

  if (fm.tags.length > 0) {
    lines.push('tags:');
    for (const t of fm.tags) lines.push(`  - ${yamlQuote(t)}`);
  }
  if (fm.keywords.length > 0) {
    lines.push('keywords:');
    for (const k of fm.keywords) lines.push(`  - ${yamlQuote(k)}`);
  }
  if (fm.image) lines.push(`image: ${yamlQuote(fm.image)}`);
  if (fm.imageAlt) lines.push(`imageAlt: ${yamlQuote(fm.imageAlt)}`);
  if (fm.featured) lines.push('featured: true');
  if (fm.faq.length > 0) {
    lines.push('faq:');
    for (const f of fm.faq) {
      lines.push(`  - question: ${yamlQuote(f.question)}`);
      lines.push(`    answer: ${yamlQuote(f.answer)}`);
    }
  }
  lines.push('---');
  return lines.join('\n');
}

app.post('/', async (c) => {
  let body: unknown;
  try { body = await c.req.json(); }
  catch { return c.json({ ok: false, error: 'invalid-json' }, 400); }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({
      ok: false,
      error: 'validation',
      issues: parsed.error.issues,
    }, 400);
  }

  const cfg = getGitHubConfig();
  if (!cfg.token) {
    return c.json({ ok: false, error: 'GITHUB_TOKEN not configured' }, 500);
  }

  const { slug, frontmatter, body: mdBody, commitMessage } = parsed.data;
  const filePath = `${ARTICLES_PATH}/${slug}.md`;

  // 1. Slug-Konflikt-Check
  const [articleExists, redirectSlugs] = await Promise.all([
    ghContentExists(filePath),
    loadRedirectSlugs(),
  ]);

  if (articleExists) {
    return c.json({
      ok: false, error: 'slug-conflict', conflict: 'article-exists',
    }, 409);
  }
  if (redirectSlugs.has(slug)) {
    return c.json({
      ok: false, error: 'slug-conflict', conflict: 'redirect-exists',
    }, 409);
  }

  // 2. File-Content bauen
  const fmText = buildFrontmatter(frontmatter);
  const fileContent = fmText + '\n\n' + mdBody.trim() + '\n';

  // 3. Commit
  const msg = commitMessage || `post: ${frontmatter.title}`;
  const res = await ghCreateFile(filePath, fileContent, msg);
  if (!res.ok) {
    console.error('[articles] gh create failed:', res.error);
    return c.json({ ok: false, error: res.error || 'github-error' }, 500);
  }

  return c.json({
    ok: true,
    slug,
    filePath,
    commitUrl: res.commitUrl,
    fileUrl: res.fileUrl,
    estimatedLiveIn: '~5-7 Min (Railway Build + Deploy)',
    liveUrl: `https://herzblatt-journal.com/blog/${slug}`,
  });
});

export default app;
