#!/usr/bin/env python3
"""
Task 2: Fix broken internal links
Removes links to articles that don't exist, keeping the text
"""

import os
import re
from pathlib import Path

def get_existing_slugs(blog_dir):
    """Get all existing article slugs (filenames without .md)."""
    slugs = set()
    for md_file in blog_dir.glob('*.md'):
        # Skip our scripts
        if md_file.name.startswith('fix_'):
            continue
        slug = md_file.stem  # filename without .md
        slugs.add(slug)
    return slugs

def remove_broken_links(file_path, existing_slugs):
    """Remove links to non-existent articles, keeping the text."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        print(f"Error reading {file_path}: {e}")
        return 0
    
    original_content = content
    fixes_count = 0
    
    # Pattern to match [text](/blog/slug/) or [text](/blog/slug)
    pattern = r'\[([^\]]+)\]\(/blog/([^\)]+?)/?(?=\))\)'
    
    def replace_broken_link(match):
        nonlocal fixes_count
        text = match.group(1)
        slug = match.group(2)
        
        # Check if this slug exists
        if slug not in existing_slugs:
            fixes_count += 1
            return text  # Replace with just the text
        else:
            return match.group(0)  # Keep the link as is
    
    new_content = re.sub(pattern, replace_broken_link, content)
    
    if new_content != original_content:
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(new_content)
        except Exception as e:
            print(f"Error writing {file_path}: {e}")
            return 0
    
    return fixes_count

def main():
    blog_dir = Path('/sessions/serene-great-archimedes/mnt/Herzblatt Journal/src/content/blog')
    
    # Get all existing slugs
    existing_slugs = get_existing_slugs(blog_dir)
    print(f"Found {len(existing_slugs)} existing articles\n")
    
    total_fixes = 0
    files_with_fixes = 0
    total_files = 0
    
    # Get all .md files
    md_files = sorted(blog_dir.glob('*.md'))
    
    for md_file in md_files:
        # Skip our scripts
        if md_file.name.startswith('fix_'):
            continue
        
        total_files += 1
        fixes = remove_broken_links(md_file, existing_slugs)
        
        if fixes > 0:
            files_with_fixes += 1
            total_fixes += fixes
            print(f"Fixed {fixes} broken link(s) in: {md_file.name}")
    
    print(f"\n{'='*60}")
    print(f"TASK 2 RESULTS: Remove Broken Internal Links")
    print(f"{'='*60}")
    print(f"Total files processed: {total_files}")
    print(f"Files with fixes: {files_with_fixes}")
    print(f"Total broken links removed: {total_fixes}")
    print(f"{'='*60}")

if __name__ == '__main__':
    main()
