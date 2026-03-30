import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

export async function GET(context) {
  const blog = await getCollection('blog', ({ data }) => !data.draft);

  return rss({
    title: "Herzblatt Journal — Dating-Ratgeber & Beziehungstipps",
    description: 'Dating-Tipps, Flirt-Ratgeber und Beziehungs-Strategien — Herzblatt Journal hilft dir, die Liebe zu finden, die du verdienst.',
    site: context.site || 'https://herzblatt-journal.com',
    items: blog
      .filter((post) => post.data.date)
      .sort((a, b) => new Date(b.data.date).valueOf() - new Date(a.data.date).valueOf())
      .map((post) => ({
        title: post.data.title,
        pubDate: post.data.date,
        description: post.data.description,
        link: `/blog/${post.id}/`,
        categories: post.data.tags,
      })),
    customData: `<language>de-de</language>`,
  });
}
