import os, re, yaml

blog_dir = "src/content/blog"
img_dir = "public/images/blog"
existing_images = set(os.listdir(img_dir))
missing = []

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
    img = data.get("image", "")
    if not img:
        slug = fname.replace(".md", "")
        missing.append(slug)
        continue
    img_file = os.path.basename(img)
    if img_file not in existing_images:
        slug = fname.replace(".md", "")
        missing.append(slug)

print(f"MISSING: {len(missing)}")
for slug in missing:
    print(slug)
