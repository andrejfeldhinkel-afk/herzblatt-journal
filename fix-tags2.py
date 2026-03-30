#!/usr/bin/env python3
import os, re, json

BLOG_DIR = "/home/xy/Andrej/blog/src/content/blog"

CORE = {"Beziehung","Dating","Psychologie","Ratgeber","Kommunikation","Selbstliebe","Date-Ideen","Lifestyle","Online-Dating","Heilung","Flirten","Intimität","Gesundheit","Red Flags","Vertrauen","Dating-Apps","Partnersuche","Trennung","Neuanfang","Lebensphasen","Single-Leben","Erstes Date","Zusammenleben","Sicherheit","Konflikte","Neurodiversität","Familie","Grenzen","Liebeskummer","Lokales Dating","Fernbeziehung","Kennenlernen","Finanzen","Digital Detox","Bindungstypen","Paartherapie","Hochzeit","Eifersucht","LGBTQ+"}

TAG_MAP = {
    "Beziehungsratgeber": "Ratgeber", "Trennungsgedanken": "Trennung",
    "Beziehungskrisen": "Konflikte", "Liebeskrise lösen": "Konflikte",
    "Ehe": "Hochzeit", "Beziehungstipps": "Beziehung", "Ehealltag": "Zusammenleben",
    "Gefühle gestehen": "Kommunikation", "Liebe gestehen Tipps": "Kommunikation",
    "Liebesgeständnis": "Kommunikation", "Angst vor Ablehnung": "Psychologie",
    "Ehe und Beziehung": "Hochzeit", "Heiraten Entscheidung": "Hochzeit",
    "Hochzeitsplanung": "Hochzeit", "Partnerschaft": "Beziehung",
    "Liebesbrief": "Kommunikation", "Gefühle ausdrücken": "Kommunikation",
    "Romantik": "Beziehung", "Beziehungskrise": "Konflikte",
    "Midlife Crisis": "Lebensphasen", "Lebenskrise": "Heilung",
    "Romance Scam": "Sicherheit", "Online Dating Sicherheit": "Sicherheit",
    "Betrug erkennen": "Red Flags", "Liebe Scamming": "Sicherheit",
    "Herzschmerz": "Liebeskummer", "Emotionale Heilung": "Heilung",
}

fixed = 0
for f in sorted(os.listdir(BLOG_DIR)):
    if not f.endswith(".md"):
        continue
    path = os.path.join(BLOG_DIR, f)
    with open(path, encoding="utf-8") as fh:
        content = fh.read()

    parts = content.split("---", 2)
    if len(parts) < 3:
        continue
    fm = parts[1]
    body = parts[2]

    # More flexible regex - zero or more whitespace before dash
    tags = []
    tag_section_match = None
    tm = re.search(r'^tags:\s*\n((?:\s*-\s+.+\n)*)', fm, re.M)
    if tm:
        raw_tags = re.findall(r'-\s+(.+)', tm.group(1))
        tags = [t.strip().strip('"\'') for t in raw_tags]
        tag_section_match = tm

    if not tags:
        im = re.search(r'^tags:\s*\[(.+)\]\s*$', fm, re.M)
        if im:
            try:
                tags = json.loads('[' + im.group(1) + ']')
            except Exception:
                tags = [t.strip().strip('"\'') for t in im.group(1).split(',')]
            tag_section_match = im

    if not tags:
        continue

    # Check if any tag needs mapping
    needs_fix = any(t in TAG_MAP for t in tags)
    if not needs_fix:
        continue

    # Map tags
    new_tags = []
    seen = set()
    for t in tags:
        mapped = TAG_MAP.get(t, t)
        if mapped not in seen:
            new_tags.append(mapped)
            seen.add(mapped)

    # Build new tags YAML (standardized format)
    new_tags_str = 'tags:\n' + '\n'.join('  - "' + t + '"' for t in new_tags) + '\n'

    # Replace in frontmatter
    if tm:
        new_fm = fm[:tm.start()] + new_tags_str + fm[tm.end():]
    elif im:
        new_fm = fm[:im.start()] + new_tags_str.rstrip() + '\n' + fm[im.end():]
    else:
        continue

    new_content = '---' + new_fm + '---' + body
    if new_content != content:
        with open(path, 'w', encoding='utf-8') as fh:
            fh.write(new_content)
        fixed += 1
        print(f"  {f}: {tags} -> {new_tags}")

print(f"\nTotal: {fixed} files fixed")
