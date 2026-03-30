import os, re, yaml

blog_dir = "src/content/blog"
VALID_TAGS = {"Beziehung", "Dating", "Online-Dating", "Dating-Apps", "Flirten", "Erstes Date", "Date-Ideen", "Selbstliebe", "Psychologie", "Kommunikation", "Konflikte", "Vertrauen", "Red Flags", "Trennung", "Neuanfang", "Liebeskummer", "Eifersucht", "Fernbeziehung", "Familie", "Zusammenleben", "Hochzeit", "Gesundheit", "Heilung", "Intimität", "Finanzen", "Bindungstypen", "LGBTQ+", "Neurodiversität", "Digital Detox", "Sicherheit", "Partnersuche", "Kennenlernen", "Lokales Dating", "Lebensphasen", "Lifestyle", "Paartherapie", "Ratgeber", "Single-Leben", "Grenzen"}

# Tag mapping for common wrong tags
TAG_MAP = {
    "Bindungsangst": "Bindungstypen",
    "Liebe": "Beziehung",
    "Nähe": "Intimität",
    "Emotionale Blockade": "Psychologie",
    "Narzissmus": "Red Flags",
    "Ghosting": "Red Flags",
    "Toxisch": "Red Flags",
    "Sexualität": "Intimität",
    "Beziehungstipps": "Ratgeber",
    "Manipulation": "Red Flags",
    "Gaslighting": "Red Flags",
    "Hochzeit planen": "Hochzeit",
    "Paar": "Beziehung",
    "Freundschaft": "Beziehung",
    "Körpersprache": "Flirten",
    "Verliebt": "Beziehung",
    "Profiltext": "Online-Dating",
    "Baby": "Familie",
    "Eltern": "Familie",
    "App": "Dating-Apps",
    "Tinder": "Dating-Apps",
    "Bumble": "Dating-Apps",
    "Parship": "Dating-Apps",
    "ElitePartner": "Dating-Apps",
    "Hinge": "Dating-Apps",
    "Profilfoto": "Online-Dating",
    "Städte": "Lokales Dating",
    "Stadt": "Lokales Dating",
    "Berlin": "Lokales Dating",
    "München": "Lokales Dating",
    "Hamburg": "Lokales Dating",
    "Köln": "Lokales Dating",
    "Frankfurt": "Lokales Dating",
    "Düsseldorf": "Lokales Dating",
    "Stuttgart": "Lokales Dating",
    "Leipzig": "Lokales Dating",
    "Dresden": "Lokales Dating",
    "Hannover": "Lokales Dating",
    "Nürnberg": "Lokales Dating",
    "Bremen": "Lokales Dating",
    "Essen": "Lokales Dating",
    "Dortmund": "Lokales Dating",
    "Freiburg": "Lokales Dating",
    "Münster": "Lokales Dating",
    "Bonn": "Lokales Dating",
    "Mannheim": "Lokales Dating",
    "Augsburg": "Lokales Dating",
    "Selbstwert": "Selbstliebe",
    "Kulturelle Unterschiede": "Lifestyle",
}

fixed = 0
for fname in sorted(os.listdir(blog_dir)):
    if not fname.endswith(".md"):
        continue
    fpath = os.path.join(blog_dir, fname)
    with open(fpath) as f:
        content = f.read()

    m = re.match(r"---\n(.*?)\n---", content, re.DOTALL)
    if not m:
        continue

    try:
        data = yaml.safe_load(m.group(1))
    except:
        continue

    if not data:
        continue

    needs_fix = False

    # Fix tags
    tags = data.get("tags", [])
    if isinstance(tags, list):
        new_tags = []
        for t in tags:
            t_str = str(t)
            if t_str in VALID_TAGS:
                new_tags.append(t_str)
            elif t_str in TAG_MAP:
                mapped = TAG_MAP[t_str]
                if mapped not in new_tags:
                    new_tags.append(mapped)
                needs_fix = True
            else:
                # Try to find closest valid tag
                needs_fix = True

        if not new_tags:
            new_tags = ["Ratgeber"]
            needs_fix = True

        # Deduplicate
        seen = set()
        deduped = []
        for t in new_tags:
            if t not in seen:
                seen.add(t)
                deduped.append(t)
        new_tags = deduped[:5]

        if new_tags != tags:
            data["tags"] = new_tags
            needs_fix = True

    # Fix keywords - must be list
    kw = data.get("keywords", [])
    if isinstance(kw, str):
        data["keywords"] = [k.strip() for k in kw.split(",")]
        needs_fix = True

    # Fix description length
    desc = str(data.get("description", ""))
    if len(desc) > 155:
        # Cut at sentence boundary
        cut = desc[:152]
        last_dot = cut.rfind(".")
        if last_dot > 80:
            data["description"] = desc[:last_dot + 1]
        else:
            data["description"] = cut.rsplit(" ", 1)[0] + "..."
        needs_fix = True

    if needs_fix:
        fm_str = m.group(1)
        body = content[m.end():]

        lines = []
        title = str(data["title"]).replace('"', "'")
        desc = str(data.get("description", title)).replace('"', "'")
        lines.append(f'title: "{title}"')
        lines.append(f'description: "{desc}"')
        lines.append(f'date: {data.get("date", "2026-03-19")}')

        img = str(data.get("image", f"/images/blog/{fname.replace('.md', '')}.webp"))
        lines.append(f'image: "{img}"')

        if "imageAlt" in data:
            alt = str(data["imageAlt"]).replace('"', "'")
            lines.append(f'imageAlt: "{alt}"')

        tag_str = ", ".join(f'"{t}"' for t in data.get("tags", ["Ratgeber"]))
        lines.append(f"tags: [{tag_str}]")

        if "keywords" in data and isinstance(data["keywords"], list):
            kw_str = ", ".join(f'"{k}"' for k in data["keywords"])
            lines.append(f"keywords: [{kw_str}]")

        lines.append("draft: false")
        lines.append(f'author: "{data.get("author", "redaktion")}"')

        if "faq" in data and isinstance(data["faq"], list):
            lines.append("faq:")
            for item in data["faq"]:
                q = str(item.get("question", "")).replace('"', "'")
                a = str(item.get("answer", "")).replace('"', "'")
                lines.append(f'  - question: "{q}"')
                lines.append(f'    answer: "{a}"')

        new_fm = "\n".join(lines)
        try:
            yaml.safe_load(new_fm)
            new_content = f"---\n{new_fm}\n---{body}"
            with open(fpath, "w") as f:
                f.write(new_content)
            fixed += 1
        except Exception as e:
            print(f"REBUILD FAIL {fname}: {e}")

print(f"Fixed: {fixed} articles")
