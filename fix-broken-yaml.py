#!/usr/bin/env python3
"""Fix YAML frontmatter issues caused by description replacement."""
import os, re

BLOG_DIR = "/home/xy/Andrej/blog/src/content/blog"

fixed = 0
for fname in sorted(os.listdir(BLOG_DIR)):
    if not fname.endswith('.md'):
        continue

    fpath = os.path.join(BLOG_DIR, fname)
    with open(fpath, 'r') as f:
        content = f.read()

    # Check if frontmatter is valid
    fm_match = re.match(r'^---\n(.*?)\n---', content, re.DOTALL)
    if not fm_match:
        continue

    fm = fm_match.group(1)
    original = content

    # Fix 1: Lines between description and date that are leftover text
    # Pattern: description: "..." \n Some leftover text \n date:
    broken = re.search(r'(description:\s*["\'].+?["\'])\n\s+([A-ZÄÖÜ].+?)\n(date:)', fm)
    if broken:
        # Remove the orphan line
        fm = fm.replace(broken.group(0), f"{broken.group(1)}\n{broken.group(3)}")
        print(f"  Fixed orphan line in {fname}: '{broken.group(2)[:50]}...'")
        fixed += 1

    # Fix 2: title with extra wrapping quotes like "'Title here'"
    title_m = re.search(r"^title:\s*\"'(.+?)'\"", fm, re.M)
    if title_m:
        clean_title = title_m.group(1)
        fm = fm.replace(title_m.group(0), f'title: "{clean_title}"')
        print(f"  Fixed extra quotes in title: {fname}")
        fixed += 1

    # Fix 3: description starting with "' (mixed quotes)
    desc_m = re.search(r'^description:\s*"\'(.+?)\'?"', fm, re.M)
    if not desc_m:
        desc_m = re.search(r"^description:\s*\"'(.+?)'?\"", fm, re.M)
    if desc_m:
        clean_desc = desc_m.group(1).replace('"', '\\"')
        fm = fm.replace(desc_m.group(0), f'description: "{clean_desc}"')
        print(f"  Fixed mixed quotes in desc: {fname}")
        fixed += 1

    if fm != fm_match.group(1):
        new_content = '---\n' + fm + '\n---' + content[fm_match.end():]
        with open(fpath, 'w') as f:
            f.write(new_content)

print(f"\nTotal fixes: {fixed}")
