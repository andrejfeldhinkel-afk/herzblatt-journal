#!/usr/bin/env python3
"""
SEO Internal Linking Booster for Herzblatt Journal
Adds targeted internal links to ranking articles to boost their authority.
"""
import os
import re
import random

BLOG_DIR = "src/content/blog"

# The 25 ranking articles from Ahrefs (target keyword -> slug)
RANKING_ARTICLES = {
    "liebesbrief schreiben": "liebesbrief-schreiben-anleitung",
    "verliebt anzeichen": "mann-verliebt-anzeichen-komplett",
    "zusammenziehen": "zusammenziehen-checkliste",
    "dating dresden": "dating-dresden",
    "rebecca syndrom": "eifersucht-ex-partner-rebecca-syndrom",
    "trennung verarbeiten": "trennung-verarbeiten-12-schritte",
    "red flags": "dating-red-flags-maenner-erkennen",
    "seelenpartner": "seelenpartner-erkennen-zeichen",
    "ghosting": "ghosting-komplett-guide",
    "green flag": "dating-green-flags-erkennen-guide",
    "beziehungspause": "beziehung-pause-regeln",
    "love bombing": "love-bombing-erkennen-schuetzen",
    "gaslighting": "gaslighting-komplett-guide",
    "friendzone": "friendzone-entkommen-guide",
    "hinge": "hinge-guide-deutsch-2026",
    "love languages": "love-languages-komplett-guide",
    "lovebombing": "love-bombing-erkennen-schuetzen",
    "kennenlernen fragen": "kennenlernen-fragen-stellen",
    "situationship": "situationship-erkennen-umgehen",
    "gesprächsthemen date": "erste-date-gespraechsthemen-guide",
    "komplimente für männer": "komplimente-fuer-maenner",
    "bumble tipps": "bumble-tipps-tricks",
    "geghostet": "ghosting-ueberwinden",
    "liebesbrief vorlage": "liebesbriefe-schreiben-vorlagen",
}

# Keywords that should link to ranking articles
LINK_MAP = {
    "Liebesbrief": "/blog/liebesbrief-schreiben-anleitung",
    "verliebt": "/blog/mann-verliebt-anzeichen-komplett",
    "zusammenziehen": "/blog/zusammenziehen-checkliste",
    "Rebecca-Syndrom": "/blog/eifersucht-ex-partner-rebecca-syndrom",
    "Trennung verarbeiten": "/blog/trennung-verarbeiten-12-schritte",
    "Red Flags": "/blog/dating-red-flags-maenner-erkennen",
    "Seelenpartner": "/blog/seelenpartner-erkennen-zeichen",
    "Ghosting": "/blog/ghosting-komplett-guide",
    "Green Flags": "/blog/dating-green-flags-erkennen-guide",
    "Beziehungspause": "/blog/beziehung-pause-regeln",
    "Love Bombing": "/blog/love-bombing-erkennen-schuetzen",
    "Gaslighting": "/blog/gaslighting-komplett-guide",
    "Friendzone": "/blog/friendzone-entkommen-guide",
    "Love Languages": "/blog/love-languages-komplett-guide",
    "Situationship": "/blog/situationship-erkennen-umgehen",
}

# Slugs of ranking articles (don't add self-links)
RANKING_SLUGS = set(RANKING_ARTICLES.values())

def get_slug_from_filename(filename):
    return filename.replace(".md", "")

def already_has_link(content, target_url):
    """Check if the article already links to target."""
    return target_url in content

def add_internal_links(filepath, slug):
    """Add internal links to an article, but only if not self-linking."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Split frontmatter and body
    parts = content.split('---', 2)
    if len(parts) < 3:
        return 0

    frontmatter = parts[1]
    body = parts[2]
    original_body = body
    links_added = 0
    max_links = 3  # Max internal links per article

    for keyword, target_url in LINK_MAP.items():
        if links_added >= max_links:
            break

        # Don't self-link
        target_slug = target_url.replace("/blog/", "")
        if target_slug == slug:
            continue

        # Don't add if already linked
        if already_has_link(body, target_url):
            continue

        # Find the keyword in the body (not in headings, not already linked)
        # Pattern: keyword not inside a markdown link and not in a heading
        pattern = rf'(?<!\[)(?<!\(/)(?<!#\s)(?<!##\s)(?<!###\s)\b({re.escape(keyword)})\b(?!\]|\))'

        match = re.search(pattern, body)
        if match:
            # Only replace first occurrence
            linked_text = f'[{match.group(1)}]({target_url})'
            body = body[:match.start()] + linked_text + body[match.end():]
            links_added += 1

    if links_added > 0:
        new_content = f'---{frontmatter}---{body}'
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)

    return links_added

def main():
    total_links = 0
    files_modified = 0

    # Get all blog files
    blog_files = [f for f in os.listdir(BLOG_DIR) if f.endswith('.md')]

    # Only process non-ranking articles (they link TO ranking articles)
    for filename in blog_files:
        slug = get_slug_from_filename(filename)

        # Skip ranking articles themselves (they shouldn't self-link)
        # But they CAN link to OTHER ranking articles
        filepath = os.path.join(BLOG_DIR, filename)

        links = add_internal_links(filepath, slug)
        if links > 0:
            total_links += links
            files_modified += 1

    print(f"Done! Added {total_links} internal links across {files_modified} articles.")
    print(f"Target: Boosting {len(RANKING_SLUGS)} ranking articles with internal link juice.")

if __name__ == "__main__":
    main()
