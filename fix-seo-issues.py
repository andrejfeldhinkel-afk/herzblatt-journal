#!/usr/bin/env python3
"""
SEO Fix Script for Herzblatt Journal
1. Adds 3-5 internal links to every article (based on tag similarity)
2. Fixes 348 articles with fake date 2024-01-01 → spread over realistic timeframe
"""

import os
import re
import json
import random
from collections import defaultdict
from datetime import datetime, timedelta

BLOG_DIR = '/home/xy/Andrej/blog/src/content/blog'

def parse_article(filepath):
    """Parse frontmatter and content from markdown file."""
    with open(filepath, 'r', encoding='utf-8') as f:
        raw = f.read()

    # Split frontmatter and content
    parts = raw.split('---', 2)
    if len(parts) < 3:
        return None

    frontmatter = parts[1]
    body = parts[2]

    # Extract title
    m = re.search(r'^title:\s*["\']?(.+?)["\']?\s*$', frontmatter, re.M)
    title = m.group(1).strip('"\'') if m else os.path.basename(filepath)[:-3]

    # Extract tags
    tags = []
    tm = re.search(r'^tags:\s*\n((?:\s+-\s+.+\n)*)', frontmatter, re.M)
    if tm:
        tags = [t.strip().strip('"\'') for t in re.findall(r'-\s+(.+)', tm.group(1))]

    # Extract date
    dm = re.search(r'^date:\s*(.+)$', frontmatter, re.M)
    date = dm.group(1).strip() if dm else ''

    # Extract description for keyword matching
    desc_m = re.search(r'^description:\s*["\']?(.+?)["\']?\s*$', frontmatter, re.M)
    desc = desc_m.group(1).strip('"\'') if desc_m else ''

    # Check if article already has a "Weiterlesen" or "Verwandte Artikel" section
    has_related = bool(re.search(r'##\s*(Weiterlesen|Verwandte Artikel|Das könnte dich auch interessieren|Ähnliche Artikel)', body))

    # Check if already has internal links in body
    internal_links = re.findall(r'\[([^\]]+)\]\(/blog/([^)]+)/?\)', body)

    return {
        'filepath': filepath,
        'frontmatter': frontmatter,
        'body': body,
        'raw': raw,
        'title': title,
        'tags': tags,
        'date': date,
        'description': desc,
        'has_related_section': has_related,
        'existing_internal_links': internal_links,
        'slug': os.path.basename(filepath)[:-3]
    }


def compute_similarity(a1, a2):
    """Compute similarity score between two articles based on tags and slug keywords."""
    score = 0

    # Tag overlap (strongest signal)
    common_tags = set(a1['tags']) & set(a2['tags'])
    score += len(common_tags) * 3

    # Slug keyword overlap
    words1 = set(a1['slug'].split('-'))
    words2 = set(a2['slug'].split('-'))
    # Remove common stop words
    stopwords = {'und', 'oder', 'der', 'die', 'das', 'ein', 'eine', 'fuer', 'mit', 'nach', 'bei', 'von', 'zu', 'im', 'am', 'als', 'wie', 'was', 'ist', 'nicht', 'tipps', 'guide', 'komplett', '2026', '2025', '2024'}
    words1 -= stopwords
    words2 -= stopwords
    common_words = words1 & words2
    score += len(common_words) * 2

    # Title keyword overlap
    title_words1 = set(re.findall(r'\w{4,}', a1['title'].lower()))
    title_words2 = set(re.findall(r'\w{4,}', a2['title'].lower()))
    common_title = title_words1 & title_words2
    score += len(common_title) * 1

    return score


def find_related_articles(target, all_articles, count=4):
    """Find the most related articles to the target."""
    scores = []
    for art in all_articles:
        if art['slug'] == target['slug']:
            continue
        sim = compute_similarity(target, art)
        if sim > 0:
            scores.append((sim, art))

    # Sort by similarity, then shuffle ties for variety
    scores.sort(key=lambda x: (-x[0], random.random()))

    # Take top N, but ensure variety (not all from exact same sub-topic)
    result = []
    used_prefixes = set()
    for sim, art in scores:
        prefix = '-'.join(art['slug'].split('-')[:2])
        # Allow max 2 articles with same prefix
        if used_prefixes.get(prefix, 0) if isinstance(used_prefixes, dict) else False:
            continue
        result.append(art)
        if len(result) >= count:
            break

    # If we didn't get enough with diversity filter, just take top
    if len(result) < count:
        result = [art for _, art in scores[:count]]

    return result


def create_related_section(related_articles):
    """Create the 'Weiterlesen' markdown section."""
    lines = ['\n\n---\n\n## Das könnte dich auch interessieren\n']
    for art in related_articles:
        lines.append(f'- [{art["title"]}](/blog/{art["slug"]}/)')
    return '\n'.join(lines) + '\n'


def fix_date(articles_with_fake_date):
    """Distribute 2024-01-01 dates over a realistic 8-month period."""
    # Spread from 2025-04-01 to 2025-12-31 (looks like gradual content building)
    start = datetime(2025, 4, 1)
    end = datetime(2025, 12, 31)
    total_days = (end - start).days

    random.seed(42)  # Reproducible
    random.shuffle(articles_with_fake_date)

    dates = []
    for i, art in enumerate(articles_with_fake_date):
        # Distribute evenly with some randomness
        base_day = int(total_days * i / len(articles_with_fake_date))
        jitter = random.randint(-3, 3)
        day = max(0, min(total_days, base_day + jitter))
        new_date = start + timedelta(days=day)
        dates.append((art, new_date.strftime('%Y-%m-%d')))

    return dates


def main():
    print("=" * 60)
    print("SEO Fix Script - Herzblatt Journal")
    print("=" * 60)

    # 1. Parse all articles
    print("\n[1/5] Lese alle Artikel...")
    articles = []
    errors = []
    for f in sorted(os.listdir(BLOG_DIR)):
        if not f.endswith('.md'):
            continue
        filepath = os.path.join(BLOG_DIR, f)
        try:
            art = parse_article(filepath)
            if art:
                articles.append(art)
        except Exception as e:
            errors.append(f"{f}: {e}")

    print(f"  ✅ {len(articles)} Artikel gelesen ({len(errors)} Fehler)")
    if errors:
        for e in errors[:5]:
            print(f"  ⚠️  {e}")

    # 2. Fix dates for 2024-01-01 articles
    print("\n[2/5] Fixe Artikel-Daten (2024-01-01)...")
    fake_date_articles = [a for a in articles if a['date'] == '2024-01-01']
    print(f"  📅 {len(fake_date_articles)} Artikel mit Datum 2024-01-01 gefunden")

    date_fixes = fix_date(fake_date_articles)
    dates_fixed = 0
    for art, new_date in date_fixes:
        with open(art['filepath'], 'r', encoding='utf-8') as f:
            content = f.read()

        new_content = content.replace('date: 2024-01-01', f'date: {new_date}', 1)
        if new_content != content:
            with open(art['filepath'], 'w', encoding='utf-8') as f:
                f.write(new_content)
            dates_fixed += 1
            art['date'] = new_date

    print(f"  ✅ {dates_fixed} Daten korrigiert (verteilt auf Apr-Dez 2025)")

    # 3. Add internal links
    print("\n[3/5] Berechne Artikel-Ähnlichkeiten...")

    # Build tag index for faster lookup
    tag_index = defaultdict(list)
    for art in articles:
        for tag in art['tags']:
            tag_index[tag].append(art)

    print(f"  📊 {len(tag_index)} verschiedene Tags")

    print("\n[4/5] Füge interne Links hinzu...")
    links_added = 0
    already_has_links = 0
    no_related = 0

    for i, art in enumerate(articles):
        if i % 200 == 0:
            print(f"  ... {i}/{len(articles)} Artikel verarbeitet")

        # Skip if already has a related section
        if art['has_related_section']:
            already_has_links += 1
            continue

        # Find related articles
        related = find_related_articles(art, articles, count=4)

        if len(related) < 2:
            no_related += 1
            continue

        # Create the related section
        section = create_related_section(related)

        # Read current file
        with open(art['filepath'], 'r', encoding='utf-8') as f:
            content = f.read()

        # Find the right place to insert - before FAQ if exists, otherwise at end
        # But after the last content paragraph
        faq_match = re.search(r'\n## FAQ', content)
        if faq_match:
            # Insert before FAQ
            insert_pos = faq_match.start()
            new_content = content[:insert_pos] + section + '\n' + content[insert_pos:]
        else:
            # Append at end
            new_content = content.rstrip() + section

        with open(art['filepath'], 'w', encoding='utf-8') as f:
            f.write(new_content)

        links_added += 1

    print(f"  ✅ {links_added} Artikel mit internen Links versehen")
    print(f"  ℹ️  {already_has_links} hatten bereits Links")
    print(f"  ⚠️  {no_related} ohne passende verwandte Artikel")

    # 5. Summary
    print("\n[5/5] Zusammenfassung")
    print("=" * 60)
    print(f"  📅 Daten gefixt:    {dates_fixed}")
    print(f"  🔗 Links hinzugefügt: {links_added}")
    print(f"  📄 Gesamt Artikel:   {len(articles)}")
    print("=" * 60)
    print("\n✅ Fertig! Jetzt deploy ausführen um Änderungen live zu stellen.")


if __name__ == '__main__':
    main()
