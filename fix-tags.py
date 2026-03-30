#!/usr/bin/env python3
"""
Tag Normalization Script for Herzblatt Journal
Maps 137 non-core tags to the 39 official core tags.
"""

import os
import re
import json
from collections import Counter

BLOG_DIR = '/home/xy/Andrej/blog/src/content/blog'

# Mapping: non-core tag → core tag
TAG_MAP = {
    # Beziehung variants
    'Beziehungstipps': 'Beziehung',
    'Beziehungsprobleme': 'Beziehung',
    'Beziehungsmuster': 'Beziehung',
    'Beziehungskrise': 'Konflikte',
    'Beziehungskrisen': 'Konflikte',
    'Beziehungspflege': 'Beziehung',
    'Beziehungspause': 'Beziehung',
    'Beziehungs-Check': 'Beziehung',
    'Beziehungsphasen': 'Beziehung',
    'Beziehung nach Baby': 'Familie',
    'beziehung': 'Beziehung',  # lowercase
    'Partnerschaft': 'Beziehung',
    'Langzeitbeziehung': 'Beziehung',
    'Paare': 'Beziehung',
    'Neue Beziehung': 'Neuanfang',
    'Toxische Beziehung': 'Red Flags',
    'Interkulturelle Beziehung': 'Beziehung',

    # Dating variants
    'Dating-Tipps': 'Dating',
    'Dating-Trends': 'Dating',
    'Dating-Standards': 'Dating',
    'Dating-Guide': 'Dating',
    'Micro-Dating': 'Dating',
    'Dating ab 50': 'Lebensphasen',
    'Dating nach Verlust': 'Neuanfang',
    'Wertebasiertes Dating': 'Dating',

    # Psychologie / Selbst
    'Selbsthilfe': 'Selbstliebe',
    'Selbstfürsorge': 'Selbstliebe',
    'Selbstreflexion': 'Selbstliebe',
    'Selbstentwicklung': 'Selbstliebe',
    'Selbstbeziehung': 'Selbstliebe',
    'Selbstheilung': 'Heilung',
    'Selbstbewusstsein': 'Selbstliebe',
    'Selbstwert': 'Selbstliebe',
    'Selbsttest': 'Ratgeber',
    'Persönlichkeitsentwicklung': 'Selbstliebe',
    'Persönliches Wachstum': 'Selbstliebe',
    'Resilienz': 'Psychologie',
    'Glaubenssätze': 'Psychologie',
    'Inneres Kind': 'Heilung',
    'People Pleasing': 'Psychologie',
    'Radikale Akzeptanz': 'Psychologie',

    # Emotionen / Mental Health
    'Emotionen': 'Psychologie',
    'Liebe': 'Beziehung',
    'Verlieben': 'Dating',
    'Herzschmerz': 'Liebeskummer',
    'Trennungsschmerz': 'Trennung',
    'Phasen': 'Trennung',
    'Einsamkeit': 'Single-Leben',
    'Alleinsein': 'Single-Leben',
    'Burnout': 'Gesundheit',
    'Stress': 'Gesundheit',
    'Mental Health': 'Gesundheit',
    'Trauma': 'Heilung',
    'Recovery': 'Heilung',
    'Trauer': 'Heilung',
    'Fehlgeburt': 'Heilung',

    # Kommunikation variants
    'Streit': 'Konflikte',
    'Streitkultur': 'Konflikte',
    'Versöhnung': 'Konflikte',
    'Vergebung': 'Konflikte',
    'GFK': 'Kommunikation',
    'Chat': 'Kommunikation',
    'Nachrichten': 'Kommunikation',
    'Bedürfnisse': 'Kommunikation',
    'Kompromisse': 'Kommunikation',

    # Intimität variants
    'Sexualität': 'Intimität',
    'Leidenschaft': 'Intimität',
    'Emotionale Nähe': 'Intimität',
    'Körperliche Nähe': 'Intimität',
    'intimität': 'Intimität',  # lowercase
    'nähe': 'Intimität',  # lowercase
    'Date Night': 'Date-Ideen',
    'Romantik': 'Beziehung',

    # Red Flags / Sicherheit
    'Red-Flags': 'Red Flags',
    'Warnsignale': 'Red Flags',
    'Narzissmus': 'Red Flags',
    'Emotionaler Missbrauch': 'Red Flags',
    'Lügen': 'Red Flags',
    'Co-Abhängigkeit': 'Red Flags',
    'Verlassensangst': 'Psychologie',
    'Anzeichen': 'Ratgeber',
    'Checkliste': 'Ratgeber',

    # Bindung / Attachment
    'Bindungstheorie': 'Bindungstypen',
    'Bindungsangst': 'Bindungstypen',

    # Neurodiversität variants
    'Hochsensibel': 'Neurodiversität',
    'HSP Dating': 'Neurodiversität',
    'Introvertiert Dating': 'Neurodiversität',
    'Introversion': 'Neurodiversität',
    'Neurodivergenz': 'Neurodiversität',
    'ADHS': 'Neurodiversität',
    'Autismus': 'Neurodiversität',

    # Familie / Leben
    'Eltern werden': 'Familie',
    'Elternschaft': 'Familie',
    'Kinderwunsch': 'Familie',
    'Schwiegereltern': 'Familie',
    'Lebensplanung': 'Lebensphasen',
    'Ü40': 'Lebensphasen',
    'Altersunterschied': 'Lebensphasen',
    'Heiratsantrag': 'Hochzeit',
    'Hochzeitstag': 'Hochzeit',

    # Lifestyle variants
    'Social Media': 'Digital Detox',
    'Humor': 'Lifestyle',
    'Schlafrhythmus': 'Gesundheit',
    'Work-Life-Balance': 'Lifestyle',
    'Fernstudium': 'Lifestyle',
    'Kulturelle Unterschiede': 'Lifestyle',
    'KI': 'Lifestyle',
    'Trends': 'Lifestyle',
    'Technologie': 'Lifestyle',
    'Wissenschaft': 'Psychologie',
    'Langeweile': 'Beziehung',
    'Fotos': 'Online-Dating',

    # Online-Dating variants
    'Profil': 'Online-Dating',
    'Bumble': 'Dating-Apps',
    'Tinder': 'Dating-Apps',

    # Misc
    'Körpersprache': 'Flirten',
    'Ansprechen': 'Flirten',
    'Männer-Ratgeber': 'Ratgeber',
    'Ex-Partner': 'Trennung',
    'Freundschaft': 'Beziehung',
    'Neustart': 'Neuanfang',
    'Ideen': 'Date-Ideen',
    'Gottman': 'Psychologie',
    'Grenzen setzen': 'Grenzen',
    'Unsicherheit': 'Selbstliebe',
    'Affäre': 'Beziehung',
    'Übungen': 'Ratgeber',
    'Journaling': 'Selbstliebe',
    'Manifestieren': 'Selbstliebe',
    'Vision Board': 'Selbstliebe',
    'Manifestation': 'Selbstliebe',
    'Erwartungen': 'Dating',
    'Kompatibilität': 'Partnersuche',
    'Frauen': 'Ratgeber',
    'Singles': 'Single-Leben',
    'München': 'Lokales Dating',
    'Beziehungsratgeber': 'Ratgeber',
    'Trennungsgedanken': 'Trennung',
    'Online Dating Sicherheit': 'Sicherheit',
    'Betrug erkennen': 'Red Flags',
    'Liebe Scamming': 'Red Flags',
    'Romance Scam': 'Sicherheit',
    'Pause': 'Beziehung',
    'Gefühle ausdrücken': 'Kommunikation',
    'Midlife Crisis': 'Lebensphasen',
    'Lebenskrise': 'Heilung',
}

CORE_TAGS = {
    'Beziehung', 'Dating', 'Psychologie', 'Ratgeber', 'Kommunikation',
    'Selbstliebe', 'Date-Ideen', 'Lifestyle', 'Online-Dating', 'Heilung',
    'Flirten', 'Intimität', 'Gesundheit', 'Red Flags', 'Vertrauen',
    'Dating-Apps', 'Partnersuche', 'Trennung', 'Neuanfang', 'Lebensphasen',
    'Single-Leben', 'Erstes Date', 'Zusammenleben', 'Sicherheit', 'Konflikte',
    'Neurodiversität', 'Familie', 'Grenzen', 'Liebeskummer', 'Lokales Dating',
    'Fernbeziehung', 'Kennenlernen', 'Finanzen', 'Digital Detox',
    'Bindungstypen', 'Paartherapie', 'Hochzeit', 'Eifersucht', 'LGBTQ+'
}


def normalize_tags(tags):
    """Map non-core tags to core tags, deduplicate."""
    result = []
    seen = set()
    for tag in tags:
        mapped = TAG_MAP.get(tag, tag)
        if mapped not in seen:
            result.append(mapped)
            seen.add(mapped)
    return result


def main():
    print("=" * 60)
    print("Tag Normalization Script")
    print("=" * 60)

    files_changed = 0
    tags_remapped = 0
    unmapped = Counter()

    for f in sorted(os.listdir(BLOG_DIR)):
        if not f.endswith('.md'):
            continue
        filepath = os.path.join(BLOG_DIR, f)
        with open(filepath, 'r', encoding='utf-8') as fh:
            content = fh.read()

        parts = content.split('---', 2)
        if len(parts) < 3:
            continue

        fm = parts[1]

        # Extract tags - YAML list format
        tags = []
        tag_format = None
        tm = re.search(r'^tags:\s*\n((?:\s+-\s+.+\n)*)', fm, re.M)
        if tm:
            tags = [t.strip().strip('"\'') for t in re.findall(r'-\s+(.+)', tm.group(1))]
            tag_format = 'yaml'

        # Inline JSON format
        if not tags:
            im = re.search(r'^tags:\s*\[(.+)\]\s*$', fm, re.M)
            if im:
                try:
                    tags = json.loads('[' + im.group(1) + ']')
                except:
                    tags = [t.strip().strip('"\'') for t in im.group(1).split(',')]
                tag_format = 'inline'

        if not tags:
            continue

        # Check if any tags need mapping
        new_tags = normalize_tags(tags)

        # Track unmapped non-core tags
        for tag in new_tags:
            if tag not in CORE_TAGS:
                unmapped[tag] += 1

        if new_tags == tags:
            continue

        # Count remapped tags
        for old, new in zip(tags, [TAG_MAP.get(t, t) for t in tags]):
            if old != new:
                tags_remapped += 1

        # Rebuild tags in YAML list format (always standardize to this)
        new_tags_yaml = 'tags:\n' + '\n'.join(f'  - "{t}"' for t in new_tags) + '\n'

        # Replace tags in frontmatter
        if tag_format == 'yaml':
            new_fm = re.sub(r'^tags:\s*\n(?:\s+-\s+.+\n)*', new_tags_yaml, fm, flags=re.M)
        else:  # inline
            new_fm = re.sub(r'^tags:\s*\[.+\]\s*$', new_tags_yaml.rstrip(), fm, flags=re.M)

        new_content = '---' + new_fm + '---' + parts[2]

        if new_content != content:
            with open(filepath, 'w', encoding='utf-8') as fh:
                fh.write(new_content)
            files_changed += 1

    print(f"\n✅ {files_changed} Dateien geändert")
    print(f"🔄 {tags_remapped} Tags umgemappt")

    if unmapped:
        print(f"\n⚠️  {len(unmapped)} Tags noch nicht gemappt:")
        for tag, count in unmapped.most_common(20):
            print(f"  {count:3d}  {tag}")
    else:
        print("\n✅ Alle Tags auf Core-Tags normalisiert!")


if __name__ == '__main__':
    main()
