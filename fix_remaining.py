#!/usr/bin/env python3
import os, re

blog_dir = "src/content/blog"
fixed = 0

for fname in sorted(os.listdir(blog_dir)):
    if not fname.endswith(".md"):
        continue
    fpath = os.path.join(blog_dir, fname)
    with open(fpath, "r") as f:
        content = f.read()

    if not content.startswith("---\n"):
        continue

    rest = content[4:]
    if "\n---\n" in rest or rest.endswith("\n---"):
        continue

    # Find the pattern: "---  (quote followed by --- in middle of content)
    new_content = content.replace('"---', '"\n---\n', 1)

    if new_content != content:
        with open(fpath, "w") as f:
            f.write(new_content)
        fixed += 1

print(f"Fixed {fixed} files")
