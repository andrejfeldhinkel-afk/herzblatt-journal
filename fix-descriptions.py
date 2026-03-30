#!/usr/bin/env python3
"""
Fix short meta descriptions (<120 chars) for Herzblatt Journal articles.
Generates proper SEO descriptions (120-155 chars) based on title and tags.
"""
import os, re

BLOG_DIR = "/home/xy/Andrej/blog/src/content/blog"

# Templates by common tag
DESC_TEMPLATES = {
    "Beziehung": [
        "{title} — Erfahre bewährte Strategien und Expertentipps für eine glücklichere, stärkere Partnerschaft im Alltag.",
        "{title}: Praktische Tipps und psychologische Einblicke für eine erfüllte Beziehung. Jetzt lesen auf Herzblatt Journal.",
        "{title} — Entdecke, wie du deine Partnerschaft nachhaltig stärken und vertiefen kannst. Konkrete Tipps und Impulse.",
    ],
    "Dating": [
        "{title} — Die besten Tipps und Strategien für erfolgreiches Dating. Authentisch, ehrlich und auf Augenhöhe.",
        "{title}: Alles was du wissen musst, um beim Dating selbstbewusst aufzutreten und die richtige Person zu finden.",
        "{title} — Praktische Dating-Ratschläge, die wirklich funktionieren. Von Experten empfohlen.",
    ],
    "Psychologie": [
        "{title} — Psychologische Hintergründe verstehen und für bessere Beziehungen nutzen. Fundiert und praxisnah erklärt.",
        "{title}: Was die Psychologie über Liebe und Beziehungen verrät. Wissenschaftlich fundierte Einblicke.",
    ],
    "Trennung": [
        "{title} — Wie du diese schwierige Phase meisterst und gestärkt daraus hervorgehst. Einfühlsame Tipps und Hilfe.",
        "{title}: Der Weg durch die Trennung — mit konkreten Schritten zurück zu dir selbst und neuem Glück.",
    ],
    "Selbstliebe": [
        "{title} — Lerne, dich selbst wertzuschätzen und eine gesunde Beziehung zu dir aufzubauen. Praktische Impulse.",
        "{title}: Warum Selbstliebe der Schlüssel zu erfüllten Beziehungen ist. Tipps für mehr Selbstwertgefühl.",
    ],
    "Online-Dating": [
        "{title} — Die besten Strategien für Online-Dating: Vom Profil bis zum ersten Treffen. Praxiserprobte Tipps.",
        "{title}: So meisterst du die Welt des Online-Datings mit Authentizität und Erfolg.",
    ],
    "Kommunikation": [
        "{title} — Bessere Kommunikation für stärkere Beziehungen. Lerne die wichtigsten Techniken für echte Verbindung.",
        "{title}: Wie du durch bessere Kommunikation Missverständnisse vermeidest und Nähe schaffst.",
    ],
    "Flirten": [
        "{title} — Flirten lernen leicht gemacht: Authentische Tipps für mehr Selbstbewusstsein beim Kennenlernen.",
        "{title}: Die Kunst des Flirtens — natürlich, charmant und erfolgreich. Jetzt Tipps entdecken.",
    ],
    "Intimität": [
        "{title} — Wege zu mehr emotionaler und körperlicher Nähe in deiner Beziehung. Einfühlsam und praxisnah.",
        "{title}: Wie du echte Intimität aufbaust und eine tiefere Verbindung mit deinem Partner erlebst.",
    ],
    "Hochzeit": [
        "{title} — Alles rund um Hochzeit und Ehe: Planung, Tipps und Inspiration für den schönsten Tag und danach.",
        "{title}: Von der Planung bis zum Eheleben — wertvolle Ratschläge für Paare.",
    ],
    "Familie": [
        "{title} — Beziehung und Familie im Einklang: Praktische Tipps für ein harmonisches Zusammenleben.",
        "{title}: Wie Familie und Partnerschaft sich gegenseitig stärken. Ratgeber mit konkreten Tipps.",
    ],
    "Konflikte": [
        "{title} — Konflikte konstruktiv lösen und die Beziehung stärken. Bewährte Methoden und praktische Tipps.",
        "{title}: Streit muss nicht destruktiv sein — lerne, wie ihr Konflikte als Chance für Wachstum nutzt.",
    ],
}

DEFAULT_TEMPLATES = [
    "{title} — Dein umfassender Ratgeber auf Herzblatt Journal. Praktische Tipps und Expertenwissen für die Liebe.",
    "{title}: Alles was du wissen musst — kompakt, verständlich und sofort umsetzbar. Jetzt lesen.",
    "{title} — Entdecke bewährte Strategien und wertvolle Impulse für dein Liebesleben auf Herzblatt Journal.",
]

def generate_description(title, tags):
    """Generate a proper SEO description (120-155 chars)."""
    import random

    # Try tag-specific template first
    for tag in tags:
        if tag in DESC_TEMPLATES:
            templates = DESC_TEMPLATES[tag]
            for tmpl in random.sample(templates, len(templates)):
                # Use shortened title if full one makes desc too long
                title_short = re.sub(r'[:\—–\|].*', '', title).strip()
                desc = tmpl.format(title=title_short)
                if 100 <= len(desc) <= 160:
                    return desc
                desc = tmpl.format(title=title)
                if 100 <= len(desc) <= 160:
                    return desc

    # Fallback to default templates
    for tmpl in DEFAULT_TEMPLATES:
        title_short = re.sub(r'[:\—–\|].*', '', title).strip()
        desc = tmpl.format(title=title_short)
        if 100 <= len(desc) <= 160:
            return desc

    # Last resort: pad with generic suffix
    title_clean = re.sub(r'[:\—–\|].*', '', title).strip()
    desc = f"{title_clean} — Tipps, Strategien und Expertenwissen für glücklichere Beziehungen auf Herzblatt Journal."
    if len(desc) > 160:
        desc = desc[:157] + "..."
    return desc


def process():
    files = sorted(os.listdir(BLOG_DIR))
    fixed = 0

    for fname in files:
        if not fname.endswith('.md'):
            continue

        fpath = os.path.join(BLOG_DIR, fname)
        with open(fpath, 'r') as f:
            content = f.read()

        fm_match = re.match(r'^---\n(.*?)\n---', content, re.DOTALL)
        if not fm_match:
            continue

        frontmatter = fm_match.group(1)

        # Get current description
        desc_m = re.search(r'^description:\s*["\'](.+?)["\']', frontmatter, re.M)
        if not desc_m:
            desc_m = re.search(r'^description:\s*(.+)', frontmatter, re.M)

        if not desc_m:
            continue

        current_desc = desc_m.group(1).strip().strip('"\'')

        if len(current_desc) >= 100:
            continue  # Already good enough

        # Get title and tags
        title_m = re.search(r'^title:\s*["\']?(.+?)["\']?\s*$', frontmatter, re.M)
        title = title_m.group(1) if title_m else fname.replace('.md', '')

        tags = []
        tags_m = re.search(r'^tags:\s*\[(.+?)\]', frontmatter, re.M)
        if tags_m:
            tags = [t.strip().strip('"\'') for t in tags_m.group(1).split(',')]
        else:
            tags_block = re.search(r'^tags:\s*\n((?:\s*-\s*.+\n)*)', frontmatter, re.M)
            if tags_block:
                tags = [re.sub(r'^\s*-\s*["\']?|["\']?\s*$', '', l) for l in tags_block.group(1).strip().split('\n')]

        new_desc = generate_description(title, tags)

        # Replace in frontmatter
        old_line = desc_m.group(0)
        new_line = f'description: "{new_desc}"'
        new_content = content.replace(old_line, new_line, 1)

        if new_content != content:
            with open(fpath, 'w') as f:
                f.write(new_content)
            fixed += 1
            if fixed <= 5:
                print(f"  {fname}: {len(current_desc)}→{len(new_desc)} chars")

    print(f"\nFixed {fixed} short descriptions")

process()
