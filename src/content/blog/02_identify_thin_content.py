#!/usr/bin/env python3
"""
Identify and list articles with less than 500 words (thin content).
Mark articles under 300 words as CRITICAL.
"""

import re
from pathlib import Path
from typing import List, Tuple


def count_words(text: str) -> int:
    """Count words in text, excluding frontmatter."""
    # Remove frontmatter
    if text.startswith("---"):
        parts = text.split("---", 2)
        if len(parts) >= 3:
            text = parts[2]

    # Count words (simple split method)
    words = text.split()
    return len(words)


def extract_title(content: str) -> str:
    """Extract title from frontmatter."""
    match = re.search(r'title:\s*["\']?([^"\'\n]+)', content)
    return match.group(1) if match else "Unknown"


def process_articles(blog_dir: Path) -> Tuple[List[Tuple[str, str, int]], List[Tuple[str, str, int]]]:
    """
    Process all articles and return two lists:
    - Articles under 300 words (CRITICAL)
    - Articles 300-500 words
    """
    critical = []
    thin = []

    articles = sorted(blog_dir.glob("*.md"))

    for article in articles:
        try:
            content = article.read_text(encoding="utf-8")
            word_count = count_words(content)
            title = extract_title(content)

            if word_count < 300:
                critical.append((article.name, title, word_count))
            elif word_count < 500:
                thin.append((article.name, title, word_count))

        except Exception as e:
            print(f"Error processing {article.name}: {e}")

    return critical, thin


def main():
    """Identify and report thin content articles."""
    blog_dir = Path("/sessions/serene-great-archimedes/mnt/Projekte/Herzblatt Journal/src/content/blog")

    if not blog_dir.exists():
        print(f"Error: Blog directory not found at {blog_dir}")
        return

    articles = list(blog_dir.glob("*.md"))
    print(f"Analyzing {len(articles)} articles...\n")

    critical, thin = process_articles(blog_dir)

    print(f"{'='*80}")
    print(f"SUMMARY - Task 2: Thin Content Analysis")
    print(f"{'='*80}")
    print(f"Total articles: {len(articles)}")
    print(f"Critical (< 300 words): {len(critical)}")
    print(f"Thin (300-500 words): {len(thin)}")
    print(f"Total needing expansion: {len(critical) + len(thin)}")
    print(f"Percentage: {((len(critical) + len(thin)) / len(articles) * 100):.1f}%\n")

    if critical:
        print(f"\n{'='*80}")
        print(f"CRITICAL ARTICLES (< 300 words) - {len(critical)} articles")
        print(f"{'='*80}")
        for filename, title, word_count in sorted(critical, key=lambda x: x[2]):
            print(f"[CRITICAL] {word_count:>4} words | {filename}")
            print(f"           Title: {title}\n")

    if thin:
        print(f"\n{'='*80}")
        print(f"THIN CONTENT (300-500 words) - {len(thin)} articles")
        print(f"{'='*80}")
        for filename, title, word_count in sorted(thin, key=lambda x: x[2]):
            print(f"[THIN]     {word_count:>4} words | {filename}")
            print(f"           Title: {title}\n")

    # Summary statistics
    print(f"\n{'='*80}")
    print(f"WORD COUNT DISTRIBUTION")
    print(f"{'='*80}")

    # Calculate distribution
    all_articles = []
    for article in blog_dir.glob("*.md"):
        try:
            content = article.read_text(encoding="utf-8")
            word_count = count_words(content)
            all_articles.append(word_count)
        except:
            pass

    all_articles.sort()

    if all_articles:
        print(f"Total articles analyzed: {len(all_articles)}")
        print(f"Shortest article: {min(all_articles)} words")
        print(f"Longest article: {max(all_articles)} words")
        print(f"Average length: {sum(all_articles) / len(all_articles):.0f} words")
        print(f"Median length: {all_articles[len(all_articles)//2]} words")

        # Percentiles
        p25_idx = int(len(all_articles) * 0.25)
        p75_idx = int(len(all_articles) * 0.75)
        print(f"25th percentile: {all_articles[p25_idx]} words")
        print(f"75th percentile: {all_articles[p75_idx]} words")

    print(f"\n{'='*80}")
    print(f"RECOMMENDATIONS")
    print(f"{'='*80}")
    print(f"1. {len(critical)} CRITICAL articles need immediate attention (content under 300 words)")
    print(f"2. {len(thin)} articles should be expanded (300-500 words)")
    print(f"3. Consider minimum target: 600-800 words for SEO effectiveness")
    print(f"4. Priority: Expand articles that target high-volume keywords first")


if __name__ == "__main__":
    main()
