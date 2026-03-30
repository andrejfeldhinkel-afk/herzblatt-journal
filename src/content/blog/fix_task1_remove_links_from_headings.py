#!/usr/bin/env python3
"""
Task 1: Remove markdown links from H2/H3 headings
Converts [text](url) to just text in heading lines
"""

import os
import re
from pathlib import Path

def remove_links_from_headings(file_path):
    """Remove markdown links from heading lines in a file."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        print(f"Error reading {file_path}: {e}")
        return 0
    
    lines = content.split('\n')
    modified = False
    fixes_count = 0
    
    for i, line in enumerate(lines):
        # Check if line starts with ## or ###
        if line.startswith('##') or line.startswith('###'):
            # Check if line contains markdown links
            if '[' in line and ']' in line and '(' in line:
                # Replace [text](url) with just text
                original_line = line
                # Pattern to match [text](url)
                new_line = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', line)
                
                if original_line != new_line:
                    lines[i] = new_line
                    modified = True
                    fixes_count += 1
    
    if modified:
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write('\n'.join(lines))
        except Exception as e:
            print(f"Error writing {file_path}: {e}")
            return 0
    
    return fixes_count

def main():
    blog_dir = Path('/sessions/serene-great-archimedes/mnt/Herzblatt Journal/src/content/blog')
    
    total_fixes = 0
    files_with_fixes = 0
    total_files = 0
    
    # Get all .md files
    md_files = sorted(blog_dir.glob('*.md'))
    print(f"Processing {len(md_files)} markdown files...\n")
    
    for md_file in md_files:
        total_files += 1
        fixes = remove_links_from_headings(md_file)
        
        if fixes > 0:
            files_with_fixes += 1
            total_fixes += fixes
            print(f"Fixed {fixes} heading(s) in: {md_file.name}")
    
    print(f"\n{'='*60}")
    print(f"TASK 1 RESULTS: Remove Links from Headings")
    print(f"{'='*60}")
    print(f"Total files processed: {total_files}")
    print(f"Files with fixes: {files_with_fixes}")
    print(f"Total heading fixes: {total_fixes}")
    print(f"{'='*60}")

if __name__ == '__main__':
    main()
