import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.date(),
    updated: z.date().optional(),
    tags: z.array(z.string()).default([]),
    image: z.string().optional(),
    imageAlt: z.string().optional(),
    keywords: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    featured: z.boolean().default(false),
    author: z.string().default("redaktion"),
    faq: z.array(z.object({
      question: z.string(),
      answer: z.string(),
    })).default([]),
    // Produkte die am Ende des Artikels als Grid gezeigt werden.
    // Slug-Array aus Admin /herzraum/produkte. Reihenfolge = Render-Reihenfolge.
    products: z.array(z.string()).default([]),
  }),
});

// E-Book-Hauptkapitel (15) — plain Markdown, kein Frontmatter.
// Werden nur auf /ebook/lesen gerendert (gated, siehe middleware).
// Filename-Pattern 0X-name.md; AUDIT-EXISTING.md u.a. Meta-Files werden
// via Numerik-Prefix ausgeschlossen (case-insensitive im glob-loader
// nicht verfügbar → explizit negatives Pattern unterstützt astro/loaders
// über Array).
const ebook = defineCollection({
  loader: glob({
    pattern: ['**/[0-9]*.md'],
    base: './src/content/ebook',
  }),
  // Kein Schema: die Files haben kein Frontmatter. Astro 4+ akzeptiert ein
  // leeres Schema; die `body`-Property bleibt erhalten.
  schema: z.object({}).passthrough(),
});

// E-Book-Bonus-Materialien (5)
const ebookBonuses = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/ebook-bonuses' }),
  schema: z.object({}).passthrough(),
});

export const collections = { blog, ebook, 'ebook-bonuses': ebookBonuses };
