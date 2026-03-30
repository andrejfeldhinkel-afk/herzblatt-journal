#!/usr/bin/env python3
"""Fix SEO issues: long titles, long descriptions, duplicate descriptions."""
import os
import re
import yaml
from collections import Counter

blog_dir = "src/content/blog"

# Stats
long_titles_fixed = 0
long_descs_fixed = 0
dupl_descs_fixed = 0
errors = []

# First pass: collect all descriptions to find duplicates
all_descs = {}
for fname in sorted(os.listdir(blog_dir)):
    if not fname.endswith(".md"):
        continue
    fpath = os.path.join(blog_dir, fname)
    with open(fpath, "r") as f:
        content = f.read()
    m = re.match(r"---\n(.*?)\n---", content, re.DOTALL)
    if not m:
        continue
    try:
        data = yaml.safe_load(m.group(1))
        if data and "description" in data:
            desc = str(data["description"]).strip()
            if desc not in all_descs:
                all_descs[desc] = []
            all_descs[desc].append(fname)
    except:
        pass

# Find duplicate descriptions
duplicate_descs = {desc: files for desc, files in all_descs.items() if len(files) > 1}
print(f"Found {len(duplicate_descs)} duplicate description groups")
for desc, files in duplicate_descs.items():
    print(f"  '{desc[:60]}...' -> {len(files)} files")

# Second pass: fix all issues
for fname in sorted(os.listdir(blog_dir)):
    if not fname.endswith(".md"):
        continue
    fpath = os.path.join(blog_dir, fname)
    with open(fpath, "r") as f:
        content = f.read()

    m = re.match(r"---\n(.*?)\n---", content, re.DOTALL)
    if not m:
        continue

    frontmatter_str = m.group(1)
    body = content[m.end():]

    try:
        data = yaml.safe_load(frontmatter_str)
    except:
        errors.append(f"YAML parse error: {fname}")
        continue

    if not data:
        continue

    changed = False
    title = str(data.get("title", ""))
    description = str(data.get("description", ""))

    # Fix 1: Title > 60 characters
    if len(title) > 60:
        original_title = title
        # Smart truncation strategies
        # Strategy 1: Cut at last space before 58 chars, no ellipsis needed for SEO
        # Strategy 2: Remove common filler words first

        # Remove common filler phrases first
        shortened = title
        fillers = [
            " – Ein umfassender Ratgeber",
            " – Ein kompletter Ratgeber",
            " – Der komplette Ratgeber",
            " – Der umfassende Ratgeber",
            " – Dein kompletter Ratgeber",
            " – Dein umfassender Ratgeber",
            " – Ein Ratgeber",
            " – Der Ratgeber",
            " – Ratgeber",
            " – Ein umfassender Guide",
            " – Der komplette Guide",
            " – Der ultimative Guide",
            " – Ein Guide",
            " – Tipps und Ratschläge",
            " – Tipps & Ratschläge",
            " – Tipps und Tricks",
            " – Tipps & Tricks",
            " – Was du wissen musst",
            " – Alles was du wissen musst",
            " – So gelingt es",
            " – So klappt es",
            " - Ein umfassender Ratgeber",
            " - Der komplette Ratgeber",
            " - Ein Ratgeber",
            " - Der Ratgeber",
            " - Ratgeber",
            " - Tipps und Ratschläge",
            " - Tipps & Tricks",
            ": Ein umfassender Ratgeber",
            ": Der komplette Ratgeber",
            ": Ein Ratgeber",
            ": Tipps und Ratschläge",
            ": Tipps & Tricks",
            ": Alles was du wissen musst",
            " – Umfassender Ratgeber",
            " – Kompletter Ratgeber",
            " – Kompletter Guide",
            " – Umfassender Guide",
        ]

        for filler in fillers:
            if filler.lower() in shortened.lower():
                idx = shortened.lower().index(filler.lower())
                shortened = shortened[:idx]
                break

        if len(shortened) <= 60:
            title = shortened
        else:
            # Try removing text after last dash/colon
            for sep in [" – ", " - ", ": "]:
                if sep in shortened:
                    parts = shortened.rsplit(sep, 1)
                    if len(parts[0]) <= 60 and len(parts[0]) >= 20:
                        shortened = parts[0]
                        break

            if len(shortened) <= 60:
                title = shortened
            else:
                # Hard truncate at last word boundary before 57 chars + "..."
                if len(shortened) > 57:
                    cut = shortened[:57].rsplit(" ", 1)[0]
                    title = cut
                else:
                    title = shortened

        if title != original_title:
            data["title"] = title
            changed = True
            long_titles_fixed += 1

    # Fix 2: Description > 155 characters
    if len(description) > 155:
        original_desc = description
        # Try to cut at sentence boundary
        shortened = description

        # Find last sentence end before 153 chars
        sentence_end = -1
        for match in re.finditer(r'[.!?]\s', shortened[:153]):
            sentence_end = match.start() + 1

        if sentence_end > 80:  # Must be at least 80 chars for a good description
            shortened = shortened[:sentence_end]
        else:
            # Cut at last word boundary before 152 chars + "..."
            cut = shortened[:152].rsplit(" ", 1)[0]
            shortened = cut + "..."

        if len(shortened) <= 155:
            description = shortened
            data["description"] = description
            changed = True
            long_descs_fixed += 1

    # Fix 3: Duplicate descriptions - make unique by incorporating title
    desc_str = str(data.get("description", "")).strip()
    if desc_str in duplicate_descs and len(duplicate_descs[desc_str]) > 1:
        files_with_this_desc = duplicate_descs[desc_str]
        # Only fix if this is NOT the first file (keep one original)
        if fname != files_with_this_desc[0]:
            # Create unique description using title
            title_str = str(data.get("title", ""))
            new_desc = f"{title_str}: {desc_str}"
            if len(new_desc) > 155:
                new_desc = new_desc[:152] + "..."
            data["description"] = new_desc
            changed = True
            dupl_descs_fixed += 1

    if changed:
        # Rebuild frontmatter
        lines = []
        # Preserve field order from original
        field_order = []
        for line in frontmatter_str.split("\n"):
            match = re.match(r'^(\w[\w-]*)\s*:', line)
            if match:
                field_order.append(match.group(1))

        # Build YAML manually to preserve formatting
        new_fm_lines = []
        for key in field_order:
            if key not in data:
                continue
            val = data[key]
            if key in ("title", "description", "image", "imageAlt", "author"):
                # Quote strings
                escaped = str(val).replace('"', '\\"')
                new_fm_lines.append(f'{key}: "{escaped}"')
            elif key == "tags":
                if isinstance(val, list):
                    tag_str = ", ".join(f'"{t}"' for t in val)
                    new_fm_lines.append(f"tags: [{tag_str}]")
                else:
                    new_fm_lines.append(f"tags: {val}")
            elif key == "keywords":
                if isinstance(val, list):
                    kw_str = ", ".join(f'"{k}"' for k in val)
                    new_fm_lines.append(f"keywords: [{kw_str}]")
                else:
                    new_fm_lines.append(f"keywords: {val}")
            elif key == "faq":
                if isinstance(val, list):
                    new_fm_lines.append("faq:")
                    for item in val:
                        q = str(item.get("question", "")).replace('"', '\\"')
                        a = str(item.get("answer", "")).replace('"', '\\"')
                        new_fm_lines.append(f'  - question: "{q}"')
                        new_fm_lines.append(f'    answer: "{a}"')
                else:
                    new_fm_lines.append(f"faq: {val}")
            elif key == "date":
                new_fm_lines.append(f"date: {val}")
            elif key == "draft":
                new_fm_lines.append(f"draft: {str(val).lower()}")
            else:
                new_fm_lines.append(f"{key}: {val}")

        new_frontmatter = "\n".join(new_fm_lines)
        new_content = f"---\n{new_frontmatter}\n---{body}"

        # Validate the new YAML
        try:
            yaml.safe_load(new_frontmatter)
            with open(fpath, "w") as f:
                f.write(new_content)
        except Exception as e:
            errors.append(f"YAML validation failed for {fname}: {e}")

print(f"\n=== RESULTS ===")
print(f"Long titles fixed: {long_titles_fixed}")
print(f"Long descriptions fixed: {long_descs_fixed}")
print(f"Duplicate descriptions fixed: {dupl_descs_fixed}")
if errors:
    print(f"\nErrors ({len(errors)}):")
    for e in errors:
        print(f"  {e}")
