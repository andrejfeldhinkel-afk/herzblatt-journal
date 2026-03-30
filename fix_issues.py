import os, re, yaml

blog_dir = "src/content/blog"

# 1. Fix duplicate titles - append unique subtitle
DUP_TITLE_FIXES = {
    "Introvertiert liebt Extrovertiert": [
        ("dating-introvertiert-extrovertiert.md", "Introvertiert liebt Extrovertiert: So klappt die Beziehung"),
        ("dating-introvertiert-extrovertiert-paar-guide.md", "Introvertiert liebt Extrovertiert: Der komplette Paar-Guide"),
    ],
    "Richtig streiten in der Beziehung": [
        ("richtig-streiten-beziehung.md", "Richtig streiten in der Beziehung: So loest ihr Konflikte"),
        ("beziehung-wenn-einer-nicht-streiten-kann.md", "Wenn einer nicht streiten kann: Konflikte in der Beziehung"),
    ],
    "Grenzen setzen in der Beziehung": [
        ("grenzen-setzen-beziehung.md", "Grenzen setzen in der Beziehung: Ein Ratgeber"),
        ("beziehung-grenzen-setzen-lernen.md", "Grenzen setzen lernen: Gesunde Beziehung aufbauen"),
    ],
    "Bindungsangst erkennen und überwinden": [
        ("bindungsangst-erkennen.md", "Bindungsangst erkennen: Symptome und Ursachen"),
        ("bindungstypen-komplett-guide-psychologie.md", "Bindungstypen verstehen: Der komplette Psychologie-Guide"),
    ],
    "50 Fragen zum Kennenlernen": [
        ("50-fragen-zum-kennenlernen.md", "50 Fragen zum Kennenlernen: Die besten Gespraechsstarter"),
        ("date-gespraechsthemen-nie-peinliche-stille.md", "Nie wieder peinliche Stille: Gespraechsthemen fuers Date"),
    ],
    "Dating für Introvertierte": [
        ("dating-introvertierte.md", "Dating fuer Introvertierte: Tipps und Strategien"),
        ("introvertiert-dating.md", "Introvertiert und auf Partnersuche: So gelingt es"),
    ],
    "Dating nach einer narzisstischen Beziehung": [
        ("dating-nach-narzisst.md", "Dating nach einer narzisstischen Beziehung: Neuanfang wagen"),
        ("narzisstische-beziehung-ueberleben-heilen.md", "Narzisstische Beziehung ueberleben und heilen"),
    ],
    "Perfektionismus beim Dating": [
        ("perfektionismus-dating.md", "Perfektionismus beim Dating: Loslassen lernen"),
        ("dating-hohe-ansprueche-oder-zu-waehlerisch.md", "Zu waehlerisch oder hohe Ansprueche? Dating-Realitaetscheck"),
    ],
    "Online-Dating Sicherheit: So schützt du dich vor Betrug": [
        ("online-dating-sicherheit-guide.md", "Online-Dating Sicherheit: Der komplette Schutz-Guide"),
        ("online-dating-sicherheit-tipps.md", "Online-Dating Sicherheit: 15 Tipps gegen Betrug"),
    ],
}

# 2. AI phrases to remove
AI_FIXES = {
    "in diesem artikel werden wir": "",
    "es ist wichtig zu beachten": "",
    "in der heutigen zeit": "",
    "in der heutigen digitalen welt": "",
}

fixed_titles = 0
fixed_ai = 0
fixed_descs = 0

# Fix duplicate titles
for old_title, file_fixes in DUP_TITLE_FIXES.items():
    for fname, new_title in file_fixes:
        fpath = os.path.join(blog_dir, fname)
        if not os.path.exists(fpath):
            continue
        with open(fpath, "r") as f:
            content = f.read()
        
        m = re.match(r"---\n(.*?)\n---", content, re.DOTALL)
        if not m:
            continue
        try:
            fm = yaml.safe_load(m.group(1))
        except:
            continue
        
        current_title = str(fm.get("title", ""))
        if current_title.strip("'\"") == old_title or current_title == old_title:
            # Replace title in frontmatter
            old_fm = m.group(1)
            # Find the title line and replace
            new_fm = re.sub(
                r'title: ["\'].*?["\']',
                'title: "' + new_title + '"',
                old_fm,
                count=1
            )
            if new_fm == old_fm:
                new_fm = re.sub(
                    r'title: .*',
                    'title: "' + new_title + '"',
                    old_fm,
                    count=1
                )
            
            if new_fm != old_fm:
                new_content = "---\n" + new_fm + "\n---" + content[m.end():]
                with open(fpath, "w") as f:
                    f.write(new_content)
                fixed_titles += 1
                print(f"TITLE FIX: {fname}: {new_title}")

# Fix AI phrases in articles
AI_FILES = [
    "beziehung-haustiere-zusammen-tipps.md",
    "beziehung-nach-elternwerden-paar-bleiben.md",
    "beziehung-nach-gemeinsamer-trennung.md",
    "beziehung-rituale-die-verbinden.md",
    "beziehung-wenn-einer-nicht-streiten-kann.md",
    "dating-authentisch-bleiben-tipps.md",
    "dating-fruehling-neue-liebe-chancen.md",
    "dating-humor-wichtigkeit-lachen.md",
    "dating-koerpersprache-richtig-deuten.md",
    "dating-nach-trauma-bereit-sein.md",
    "eifersucht-beziehung-ueberwinden.md",
    "kompletter-dating-guide-fuer-anfaenger.md",
    "micro-cheating-grenzen-beziehung.md",
]

for fname in AI_FILES:
    fpath = os.path.join(blog_dir, fname)
    if not os.path.exists(fpath):
        continue
    with open(fpath, "r") as f:
        content = f.read()
    
    new_content = content
    for phrase, replacement in AI_FIXES.items():
        # Case-insensitive sentence replacement
        pattern = re.compile(r'[^.]*' + re.escape(phrase) + r'[^.]*\.', re.IGNORECASE)
        matches = pattern.findall(new_content)
        if matches:
            for match in matches:
                new_content = new_content.replace(match, "")
                fixed_ai += 1
    
    if new_content != content:
        # Clean up double spaces/newlines
        new_content = re.sub(r'\n{3,}', '\n\n', new_content)
        with open(fpath, "w") as f:
            f.write(new_content)
        print(f"AI FIX: {fname}")

print(f"\nFixed {fixed_titles} duplicate titles")
print(f"Fixed {fixed_ai} AI phrases")
