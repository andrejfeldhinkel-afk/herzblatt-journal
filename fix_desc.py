import os, re, yaml

blog_dir = "src/content/blog"
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

    if "description" not in data or not data.get("description"):
        title = str(data.get("title", fname))
        desc = title[:155]
        fm = m.group(1)
        fm = re.sub(r'(title: .+\n)', r'\1description: "' + desc.replace('"', "'") + '"\n', fm, count=1)
        body = content[m.end():]
        new_content = "---\n" + fm + "\n---" + body
        with open(fpath, "w") as f:
            f.write(new_content)
        fixed += 1

print(f"Added description to {fixed} files")
