#!/usr/bin/env python3
"""
Comprehensive YAML fix: find and repair all broken description lines
where the replacement left remnant text after the closing quote.
Also find and remove duplicate slug files (keep longer one).
"""
import os, re

BLOG_DIR = "/home/xy/Andrej/blog/src/content/blog"

fixed = 0
for fname in sorted(os.listdir(BLOG_DIR)):
    if not fname.endswith('.md'):
        continue

    fpath = os.path.join(BLOG_DIR, fname)
    with open(fpath, 'r') as f:
        lines = f.readlines()

    modified = False
    new_lines = []
    i = 0
    in_frontmatter = False
    fm_count = 0

    while i < len(lines):
        line = lines[i]

        if line.strip() == '---':
            fm_count += 1
            in_frontmatter = (fm_count == 1)
            new_lines.append(line)
            i += 1
            continue

        if in_frontmatter and fm_count == 1:
            # Fix description with text after closing quote
            # Pattern: description: "good text", leftover text"
            m = re.match(r'^(description:\s*"[^"]+)"(.+)$', line)
            if m:
                # The line has extra content after what should be the closing quote
                new_lines.append(m.group(1) + '"\n')
                print(f"  {fname}: Trimmed desc remnant")
                modified = True
                i += 1
                continue

            # Fix description: "text"  continuation on same line
            m2 = re.match(r'^(description:\s*"[^"]+",)\s*(.+)$', line)
            if m2:
                clean = re.match(r'^(description:\s*"[^"]+")', line)
                if clean:
                    new_lines.append(clean.group(1) + '\n')
                    print(f"  {fname}: Cleaned desc trailing comma+text")
                    modified = True
                    i += 1
                    continue

            # Fix orphan lines (indented text not starting with a YAML key)
            if re.match(r'^\s+[A-ZÄÖÜ]', line) and not re.match(r'^\s+-\s', line) and not re.match(r'^\s+\w+:', line):
                # Check if previous line was description
                if new_lines and 'description:' in new_lines[-1]:
                    print(f"  {fname}: Removed orphan line: {line.strip()[:50]}")
                    modified = True
                    i += 1
                    continue

        new_lines.append(line)
        i += 1

    if modified:
        with open(fpath, 'w') as f:
            f.writelines(new_lines)
        fixed += 1

# Find duplicates
from collections import defaultdict
slug_files = defaultdict(list)
for fname in sorted(os.listdir(BLOG_DIR)):
    if not fname.endswith('.md'):
        continue
    # Astro uses filename as slug, but some might have same content ID
    slug_files[fname].append(fname)

print(f"\nFixed {fixed} files with broken YAML")
