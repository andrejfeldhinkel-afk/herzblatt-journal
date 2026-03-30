import os, re, yaml

blog_dir = "src/content/blog"
broken_files = [
    "beziehung-30-day-challenge.md",
    "beziehungskrise-phasen-guide.md",
    "dating-introvertierte.md",
    "dating-nach-30-tipps.md",
    "dating-nach-40-maenner.md",
    "dating-profil-beispiele-vorher-nachher.md",
    "dating-statistiken-deutschland-2026.md",
    "drittes-date-bedeutung.md",
    "ex-zurueck-strategie-guide.md",
    "offline-dating-orte-kennenlernen.md",
]

fixed = 0
for fname in broken_files:
    fpath = os.path.join(blog_dir, fname)
    with open(fpath, "r") as f:
        content = f.read()

    # Fix: any character followed by --- followed by newline (not standalone ---)
    new_content = re.sub(r'([^\n])---\n', r'\1\n---\n', content)
    
    if new_content != content:
        with open(fpath, "w") as f:
            f.write(new_content)
        # Verify
        m = re.match(r"---\n(.*?)\n---", new_content, re.DOTALL)
        if m:
            try:
                yaml.safe_load(m.group(1))
                print(f"FIXED: {fname}")
                fixed += 1
            except Exception as e:
                print(f"STILL BROKEN: {fname}: {str(e)[:100]}")
        else:
            print(f"NO FM: {fname}")
    else:
        print(f"NO CHANGE: {fname}")

print(f"\nFixed: {fixed}/10")
