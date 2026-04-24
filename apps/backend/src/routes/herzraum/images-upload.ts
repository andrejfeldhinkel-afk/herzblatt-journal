/**
 * /herzraum/images/upload — Admin-Image-Upload ins Blog-Bilder-Verzeichnis.
 *
 * Design-Entscheidung: Storage in GitHub, gleich wie Articles.
 * Vorteile:
 *   - Keine zusätzliche Storage-Infra (kein S3, kein Railway-Volume, keine Credentials).
 *   - Bilder werden mit jedem Build mit ausgeliefert (public/images/blog/*.webp).
 *   - Versionierung inkl. Rollback via git.
 *
 * Nachteile:
 *   - GitHub hat 100 MB/File und 5 GB/Repo-Soft-Limit. Für Blog-Thumbnails (WebP
 *     <100 KB) sehr bequem. Für Hochauflösende Produkt-Pics würde S3 Sinn machen.
 *   - Jeder Upload ist ein Commit → Repo-History wird größer. Bei intensiver
 *     Nutzung (100+/Monat) könnte ein eigener Assets-Branch Sinn machen.
 *
 * Accept: multipart/form-data mit Field "file". Max 8 MB. Allowed:
 *   jpg/jpeg/png/webp/gif/avif.
 * Path: apps/frontend/public/images/blog/{slug}.{ext}
 * Rückgabe: Public-URL (/images/blog/{slug}.{ext}).
 */
import { Hono } from 'hono';
import { logAudit } from '../../lib/audit.js';

const app = new Hono();

const GH_API = 'https://api.github.com';
const IMAGES_PATH = 'apps/frontend/public/images/blog';
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const VALID_SLUG = /^[a-z0-9][a-z0-9-]{2,80}$/;
const ALLOWED_MIMES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

function getGitHubConfig() {
  return {
    token: process.env.GITHUB_TOKEN || '',
    owner: process.env.GITHUB_OWNER || 'andrejfeldhinkel-afk',
    repo: process.env.GITHUB_REPO || 'herzblatt-journal',
    branch: process.env.GITHUB_BRANCH || 'main',
  };
}

async function ghFileExists(path: string): Promise<boolean> {
  const cfg = getGitHubConfig();
  if (!cfg.token) return false;
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

async function ghPutBinary(
  path: string,
  bytes: Uint8Array,
  commitMessage: string,
): Promise<{ ok: boolean; error?: string; commitUrl?: string; fileUrl?: string }> {
  const cfg = getGitHubConfig();
  if (!cfg.token) return { ok: false, error: 'GITHUB_TOKEN not set' };

  // PUT contents API verlangt base64
  const content = Buffer.from(bytes).toString('base64');

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
      message: commitMessage,
      branch: cfg.branch,
      content,
      committer: {
        name: 'Herzraum Admin',
        email: 'admin@herzblatt-journal.de',
      },
    }),
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

// POST / — Upload ein Bild
app.post('/upload', async (c) => {
  const cfg = getGitHubConfig();
  if (!cfg.token) {
    return c.json({ ok: false, error: 'GITHUB_TOKEN not configured' }, 500);
  }

  // Parse multipart
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return c.json({ ok: false, error: 'invalid-multipart' }, 400);
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return c.json({ ok: false, error: 'missing-file' }, 400);
  }

  if (file.size === 0) {
    return c.json({ ok: false, error: 'empty-file' }, 400);
  }
  if (file.size > MAX_BYTES) {
    return c.json({ ok: false, error: 'too-large', maxBytes: MAX_BYTES, size: file.size }, 413);
  }

  const mime = file.type.toLowerCase();
  const ext = ALLOWED_MIMES[mime];
  if (!ext) {
    return c.json({ ok: false, error: 'invalid-mime', mime, allowed: Object.keys(ALLOWED_MIMES) }, 415);
  }

  // Slug bestimmen: Form-Feld "slug" wenn angegeben, sonst vom Filename ableiten.
  let slug = (form.get('slug') as string | null)?.trim().toLowerCase() || '';
  if (!slug) {
    const base = (file.name || 'upload').replace(/\.[^.]+$/, '');
    slug = base
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Diakritika raus
      .replace(/[äöüß]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' })[c] || c)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  }
  if (!VALID_SLUG.test(slug)) {
    return c.json({ ok: false, error: 'invalid-slug', slug, hint: 'a-z, 0-9, hyphen, 3-80 chars' }, 400);
  }

  const path = `${IMAGES_PATH}/${slug}.${ext}`;

  // Konflikt: bereits existiert?
  const overwrite = form.get('overwrite') === '1';
  if (!overwrite && (await ghFileExists(path))) {
    return c.json({
      ok: false,
      error: 'already-exists',
      slug,
      ext,
      hint: 'Send `overwrite=1` to replace.',
    }, 409);
  }

  // Binary lesen
  const ab = await file.arrayBuffer();
  const bytes = new Uint8Array(ab);

  const result = await ghPutBinary(
    path,
    bytes,
    `chore(images): upload ${slug}.${ext}`,
  );
  if (!result.ok) {
    return c.json({ ok: false, error: 'github-failed', details: result.error }, 502);
  }

  await logAudit(c, {
    action: 'images.upload',
    target: path,
    meta: { slug, ext, bytes: file.size, mime },
  });

  return c.json({
    ok: true,
    slug,
    ext,
    path,
    publicUrl: `/images/blog/${slug}.${ext}`,
    commitUrl: result.commitUrl,
    note: 'Deployment nach Merge auf main. Public-URL ist sofort nach Railway-Rebuild live.',
  }, 201);
});

// GET /check?slug=xxx — prüft ob Slug frei ist (für irgendeine der Extensions)
app.get('/check', async (c) => {
  const slug = (c.req.query('slug') || '').trim().toLowerCase();
  if (!slug || !VALID_SLUG.test(slug)) {
    return c.json({ available: false, reason: 'invalid-slug' }, 400);
  }
  const exts = ['webp', 'jpg', 'png', 'gif', 'avif'] as const;
  const found: string[] = [];
  for (const ext of exts) {
    if (await ghFileExists(`${IMAGES_PATH}/${slug}.${ext}`)) {
      found.push(ext);
    }
  }
  return c.json({ available: found.length === 0, slug, existingExtensions: found });
});

export default app;
