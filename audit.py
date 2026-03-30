import os, re, yaml
from collections import Counter

blog_dir = "src/content/blog"
total = 0; yaml_ok = 0; yaml_err = 0
no_title = 0; no_desc = 0; no_date = 0; no_image = 0; no_tags = 0
title_long = 0; desc_long = 0
thin_content = 0; no_h2 = 0
missing_images = []
ai_phrase_files = []
dup_titles = Counter()
dup_descs = Counter()

all_images = set(os.listdir("public/images/blog"))

AI_PHRASES = [
    "in der heutigen digitalen welt",
    "es ist wichtig zu beachten",
    "zusammenfassend lässt sich sagen",
    "in diesem artikel werden wir",
    "lass uns eintauchen",
    "ohne weitere umschweife",
    "tauchen wir ein",
    "in der heutigen zeit",
]

for fname in sorted(os.listdir(blog_dir)):
    if not fname.endswith(".md"):
        continue
    total += 1
    fpath = os.path.join(blog_dir, fname)
    
    with open(fpath, "r") as f:
        content = f.read()
    
    m = re.match(r"---\n(.*?)\n---", content, re.DOTALL)
    if not m:
        yaml_err += 1
        continue
    
    try:
        fm = yaml.safe_load(m.group(1))
    except:
        yaml_err += 1
        continue
    
    yaml_ok += 1
    
    title = fm.get("title", "")
    desc = fm.get("description", "")
    date = fm.get("date", None)
    image = fm.get("image", "")
    tags = fm.get("tags", [])
    
    if not title: no_title += 1
    if not desc: no_desc += 1
    if not date: no_date += 1
    if not image: no_image += 1
    if not tags: no_tags += 1
    
    if title and len(str(title)) > 60: title_long += 1
    if desc and len(str(desc)) > 155: desc_long += 1
    
    if title: dup_titles[str(title).strip()] += 1
    if desc: dup_descs[str(desc).strip()] += 1
    
    if image:
        img_file = os.path.basename(str(image))
        if img_file not in all_images:
            missing_images.append(fname + " -> " + img_file)
    
    body = content[m.end():]
    words = len(body.split())
    if words < 500: thin_content += 1
    
    h2s = len(re.findall(r"^## ", body, re.MULTILINE))
    if h2s == 0: no_h2 += 1
    
    body_lower = body.lower()
    for phrase in AI_PHRASES:
        if phrase in body_lower:
            ai_phrase_files.append(fname + ": " + phrase)
            break

print("=== HERZBLATT JOURNAL AUDIT ===")
print("Total:", total)
print("YAML OK:", yaml_ok)
print("YAML errors:", yaml_err)
print("\n--- MISSING FIELDS ---")
print("No title:", no_title)
print("No description:", no_desc)
print("No date:", no_date)
print("No image:", no_image)
print("No tags:", no_tags)
print("\n--- LENGTH ---")
print("Title >60:", title_long)
print("Desc >155:", desc_long)
print("\n--- CONTENT ---")
print("Thin (<500 words):", thin_content)
print("No H2:", no_h2)
print("\n--- DUPLICATES ---")
dt = [(t,c) for t,c in dup_titles.items() if c > 1]
print("Dup titles:", len(dt))
for t,c in dt[:10]:
    print("  [%dx] %s" % (c, t[:70]))
dd = [(d[:60],c) for d,c in dup_descs.items() if c > 1]
print("Dup descs:", len(dd))
for d,c in dd[:5]:
    print("  [%dx] %s" % (c, d))
print("\n--- MISSING IMAGES ---")
print("Missing:", len(missing_images))
for mi in missing_images[:10]:
    print("  " + mi)
print("\n--- AI PHRASES ---")
print("Count:", len(ai_phrase_files))
for ap in ai_phrase_files[:15]:
    print("  " + ap)
