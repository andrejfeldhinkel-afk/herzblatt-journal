#!/usr/bin/env python3
import os
import re
from pathlib import Path
from collections import defaultdict

BLOG_DIR = "/home/xy/Andrej/blog/src/content/blog"

def extract_frontmatter(content):
    """Extract frontmatter and body separately"""
    lines = content.split('\n')
    if not lines[0].strip() == '---':
        return None, content
    
    end_idx = None
    for i in range(1, len(lines)):
        if lines[i].strip() == '---':
            end_idx = i
            break
    
    if end_idx is None:
        return None, content
    
    frontmatter = '\n'.join(lines[:end_idx + 1])
    body = '\n'.join(lines[end_idx + 1:])
    return frontmatter, body

def parse_frontmatter(frontmatter_str):
    """Parse YAML-like frontmatter to extract tags"""
    tags = []
    
    for line in frontmatter_str.split('\n'):
        if line.startswith('tags:'):
            # Try to extract tags from the same line or next lines
            rest = line[5:].strip()
            if rest.startswith('['):
                # Format: tags: ["tag1", "tag2"]
                match = re.findall(r'"([^"]+)"', rest)
                tags.extend(match)
            else:
                # Format: tags:
                # - tag1
                # - tag2
                in_tags = True
                idx = frontmatter_str.split('\n').index(line)
                for next_line in frontmatter_str.split('\n')[idx+1:]:
                    if next_line.startswith('  - '):
                        tag = next_line[4:].strip().strip("'\"")
                        tags.append(tag)
                    elif next_line and not next_line.startswith(' '):
                        break
    
    return tags

def has_internal_links(body):
    """Check if body has any /blog/ links"""
    return '/blog/' in body

def get_slug_from_filename(filename):
    """Extract slug from filename"""
    return filename.replace('.md', '')

def get_title_from_frontmatter(frontmatter):
    """Extract title from frontmatter"""
    for line in frontmatter.split('\n'):
        if line.startswith('title:'):
            title = line[6:].strip().strip("'\"")
            return title
    return None

def find_related_posts(current_tags, posts_by_tags, exclude_slug=None, count=5):
    """Find related posts based on shared tags"""
    related = defaultdict(lambda: ("", 0))
    
    for tag in current_tags:
        if tag in posts_by_tags:
            for post_slug, post_title in posts_by_tags[tag]:
                if post_slug != exclude_slug:
                    title, score = related[post_slug]
                    related[post_slug] = (post_title, score + 1)
    
    # Sort by number of shared tags, then by slug
    sorted_related = sorted(related.items(), key=lambda x: (-x[1][1], x[0]))
    return sorted_related[:count]

def main():
    blog_files = list(Path(BLOG_DIR).glob('*.md'))
    print(f"Found {len(blog_files)} blog posts")
    
    # First pass: build maps
    slug_to_title = {}
    slug_to_tags = {}
    posts_by_tags = defaultdict(list)
    
    for file_path in blog_files:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
        except Exception as e:
            print(f"Error reading {file_path}: {e}")
            continue
        
        frontmatter, body = extract_frontmatter(content)
        if not frontmatter:
            continue
        
        slug = get_slug_from_filename(file_path.name)
        title = get_title_from_frontmatter(frontmatter)
        tags = parse_frontmatter(frontmatter)
        
        if title and tags:
            slug_to_title[slug] = title
            slug_to_tags[slug] = tags
            
            for tag in tags:
                posts_by_tags[tag].append((slug, title))
    
    print(f"Built index with {len(slug_to_title)} posts")
    print(f"Found {len(posts_by_tags)} unique tags")
    
    # Second pass: update posts without internal links
    updated_count = 0
    no_tags_count = 0
    has_links_count = 0
    
    for file_path in sorted(blog_files):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
        except Exception as e:
            print(f"Error reading {file_path}: {e}")
            continue
        
        frontmatter, body = extract_frontmatter(content)
        if not frontmatter:
            continue
        
        slug = get_slug_from_filename(file_path.name)
        
        # Skip if already has internal links
        if has_internal_links(body):
            has_links_count += 1
            continue
        
        tags = slug_to_tags.get(slug, [])
        
        if not tags:
            no_tags_count += 1
            continue
        
        # Find related posts
        related_posts = find_related_posts(tags, posts_by_tags, exclude_slug=slug, count=5)
        
        if not related_posts:
            continue
        
        # Build "Weiterlesen" section
        weiterlesen = "\n## Weiterlesen\n\n"
        for post_slug, (post_title, _) in related_posts:
            weiterlesen += f"- [{post_title}](/blog/{post_slug}/)\n"
        
        # Add to body
        new_body = body.rstrip() + weiterlesen
        new_content = frontmatter + new_body
        
        # Write back
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(new_content)
            
            updated_count += 1
            tag_names = ', '.join(tags[:2])
            print(f"Updated: {slug} (tags: {tag_names})")
        except Exception as e:
            print(f"Error writing {file_path}: {e}")
    
    print(f"\n--- Results ---")
    print(f"Posts with existing internal links: {has_links_count}")
    print(f"Posts with no tags: {no_tags_count}")
    print(f"Posts updated with 'Weiterlesen' section: {updated_count}")

if __name__ == '__main__':
    main()
