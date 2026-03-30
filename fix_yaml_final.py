#!/usr/bin/env python3
"""Final fix for all broken YAML frontmatter files."""
import os, re, yaml

blog_dir = "src/content/blog"
fixed = 0
still_broken = 0

for fname in sorted(os.listdir(blog_dir)):
    if not fname.endswith(".md"):
        continue
    fpath = os.path.join(blog_dir, fname)
    with open(fpath, "r") as f:
        content = f.read()

    m = re.match(r"---\n(.*?)\n---", content, re.DOTALL)
    if m:
        try:
            yaml.safe_load(m.group(1))
            continue
        except:
            pass

    # Fix: split "--- that has content after it
    new_content = re.sub(r'"---##', '"\n---\n\n##', content, count=1)
    if new_content != content:
        with open(fpath, "w") as f:
            f.write(new_content)
        fixed += 1
        continue

    new_content = re.sub(r'"---([A-Z])', '"\n---\n\n\\1', content, count=1)
    if new_content != content:
        with open(fpath, "w") as f:
            f.write(new_content)
        fixed += 1
        continue

    new_content = re.sub(r'"---([^\n])', '"\n---\n\n\\1', content, count=1)
    if new_content != content:
        with open(fpath, "w") as f:
            f.write(new_content)
        fixed += 1
        continue

    still_broken += 1
    print(f"STILL BROKEN: {fname}")

print(f"\nFixed: {fixed}, Still broken: {still_broken}")
