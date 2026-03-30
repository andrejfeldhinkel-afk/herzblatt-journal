#!/usr/bin/env python3
"""
Add 1-2 external authority links to articles without external links.
Maps article topics to trusted German authority sources.
"""

import os
import re
import random
from pathlib import Path
from typing import Dict, List, Tuple

# Authority sources by topic
AUTHORITY_LINKS = {
    "psychology": [
        ("Psychologie Heute", "https://www.psychologie-heute.de/"),
        ("Therapie Portal", "https://www.therapie.de/"),
        ("Neurologen und Psychiater im Netz", "https://www.neurologen-und-psychiater-im-netz.org/"),
    ],
    "dating": [
        ("Verbraucherzentrale", "https://www.verbraucherzentrale.de/"),
        ("Bundesamt für Sicherheit in der Informationstechnik", "https://www.bsi.bund.de/"),
    ],
    "mental_health": [
        ("Telefonseelsorge", "https://www.telefonseelsorge.de/"),
        ("Deutsche Depressionshilfe", "https://www.deutsche-depressionshilfe.de/"),
    ],
    "general": [
        ("Bundesministerium für Familie", "https://www.bmfsfj.de/"),
        ("Pro Familia", "https://www.profamilia.de/"),
        ("Caritas Beratung", "https://www.caritas.de/"),
    ],
}

# Tags/keywords that map to categories
CATEGORY_MAPPING = {
    "psychology": ["psychologie", "bindung", "attachment", "trauma", "therapie", "angst"],
    "dating": ["dating", "online", "single", "flirten", "kennenlernen", "app"],
    "mental_health": ["depression", "stress", "angst", "panik", "burnout", "selbstmord", "krise"],
}


def categorize_article(title: str, tags: List[str], keywords: List[str]) -> str:
    """Determine the best category for an article based on content."""
    text = (title + " " + " ".join(tags) + " " + " ".join(keywords)).lower()

    # Check for specific categories first
    for category, keywords_list in CATEGORY_MAPPING.items():
        for keyword in keywords_list:
            if keyword in text:
                return category

    # Default to general
    return "general"


def has_external_links(content: str) -> bool:
    """Check if article already has external links."""
    return "https://" in content


def select_authority_links(category: str, count: int = 2) -> List[Tuple[str, str]]:
    """Select 1-2 relevant authority links for the category."""
    sources = AUTHORITY_LINKS.get(category, AUTHORITY_LINKS["general"])
    selected = random.sample(sources, min(count, len(sources)))
    return selected


def create_citation_text(link_name: str, link_url: str) -> str:
    """Create natural German citation text."""
    phrases = [
        f"Weitere Informationen findest du bei {link_name}",
        f"Mehr zum Thema erfährst du auf {link_name}",
        f"Hilfreiche Ressourcen findest du bei {link_name}",
        f"Detaillierte Infos bietet {link_name}",
    ]

    phrase = random.choice(phrases)
    return f"{phrase}: [{link_name}]({link_url})"


def insert_external_link(content: str, link_name: str, link_url: str) -> str:
    """
    Insert external link into the article.
    Find a good paragraph insertion point (middle-to-end of content).
    """
    # Split content into lines
    lines = content.split("\n")

    # Find paragraphs (non-empty lines that aren't headers)
    paragraph_indices = []
    for i, line in enumerate(lines):
        if (
            line.strip()
            and not line.startswith("#")
            and not line.startswith("---")
            and not line.startswith("[")
            and len(line.strip()) > 50
        ):
            paragraph_indices.append(i)

    if not paragraph_indices:
        return content

    # Insert link after a paragraph in the middle-to-end area
    # Aim for around 60-70% through the content
    target_idx = int(len(paragraph_indices) * 0.65)
    target_idx = min(target_idx, len(paragraph_indices) - 1)

    insert_line = paragraph_indices[target_idx]

    # Create citation text
    citation = create_citation_text(link_name, link_url)

    # Insert after the target paragraph
    lines.insert(insert_line + 1, "")
    lines.insert(insert_line + 2, citation)

    return "\n".join(lines)


def process_article(filepath: Path) -> Tuple[bool, str]:
    """
    Process a single article file.
    Returns (modified, message)
    """
    try:
        content = filepath.read_text(encoding="utf-8")

        # Skip if already has external links
        if has_external_links(content):
            return False, "Already has external links"

        # Parse frontmatter
        if not content.startswith("---"):
            return False, "Invalid frontmatter"

        # Extract frontmatter
        parts = content.split("---", 2)
        if len(parts) < 3:
            return False, "Could not parse frontmatter"

        frontmatter = parts[1]
        body = parts[2]

        # Extract title and tags
        title_match = re.search(r'title:\s*["\']?([^"\'\n]+)', frontmatter)
        title = title_match.group(1) if title_match else ""

        # Extract tags
        tags_match = re.search(r"tags:\s*\n([\s\S]*?)(?=\n\w+:|---)", frontmatter)
        tags = []
        if tags_match:
            tag_lines = tags_match.group(1).split("\n")
            tags = [line.strip(" -\"'") for line in tag_lines if line.strip()]

        # Extract keywords
        keywords_match = re.search(r"keywords:\s*\n([\s\S]*?)(?=\n\w+:|---)", frontmatter)
        keywords = []
        if keywords_match:
            kw_lines = keywords_match.group(1).split("\n")
            keywords = [line.strip(" -\"'[]") for line in kw_lines if line.strip()]

        # Categorize
        category = categorize_article(title, tags, keywords)

        # Select authority links (1-2)
        num_links = random.randint(1, 2)
        authority_links = select_authority_links(category, num_links)

        # Add links to body
        modified_body = body
        for link_name, link_url in authority_links:
            modified_body = insert_external_link(modified_body, link_name, link_url)

        # Reconstruct file
        new_content = f"---{frontmatter}---{modified_body}"
        filepath.write_text(new_content, encoding="utf-8")

        link_names = ", ".join([name for name, _ in authority_links])
        return True, f"Added {len(authority_links)} links ({category}): {link_names}"

    except Exception as e:
        return False, f"Error: {str(e)}"


def main():
    """Process all articles in the blog directory."""
    blog_dir = Path("/sessions/serene-great-archimedes/mnt/Projekte/Herzblatt Journal/src/content/blog")

    if not blog_dir.exists():
        print(f"Error: Blog directory not found at {blog_dir}")
        return

    articles = sorted(blog_dir.glob("*.md"))
    print(f"Found {len(articles)} articles\n")

    modified_count = 0
    skipped_count = 0
    error_count = 0

    modified_articles = []
    skipped_articles = []

    for article in articles:
        modified, message = process_article(article)

        if modified:
            modified_count += 1
            modified_articles.append((article.name, message))
            print(f"✓ {article.name}: {message}")
        else:
            if "Already has external links" in message:
                skipped_count += 1
            else:
                error_count += 1
            skipped_articles.append((article.name, message))

    print(f"\n{'='*80}")
    print(f"SUMMARY - Task 1: Add External Authority Links")
    print(f"{'='*80}")
    print(f"Total articles processed: {len(articles)}")
    print(f"Modified: {modified_count}")
    print(f"Skipped (already have links): {skipped_count}")
    print(f"Errors: {error_count}")
    print(f"\nNext: Run 02_identify_thin_content.py to find articles under 500 words")


if __name__ == "__main__":
    main()
