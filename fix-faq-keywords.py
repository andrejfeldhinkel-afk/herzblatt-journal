#!/usr/bin/env python3
"""
Generate FAQ sections and keywords for Herzblatt Journal articles that are missing them.
FAQs are generated based on title, tags, and description.
Keywords are extracted from title + tags.
"""
import os, re, random

BLOG_DIR = "/home/xy/Andrej/blog/src/content/blog"

# FAQ templates by tag/topic - each returns (question, answer) tuples
FAQ_TEMPLATES = {
    "Beziehung": [
        ("Wie kann ich meine Beziehung verbessern?", "Offene Kommunikation, gemeinsame Quality-Time und gegenseitiger Respekt sind die Basis. Sprecht regelmäßig über eure Bedürfnisse und hört einander aktiv zu."),
        ("Wann sollte man um eine Beziehung kämpfen?", "Wenn beide Partner grundsätzlich bereit sind, an Problemen zu arbeiten, Respekt vorhanden ist und die positiven Momente überwiegen. Einseitiger Einsatz reicht nicht."),
        ("Was sind Anzeichen für eine gesunde Beziehung?", "Gegenseitiges Vertrauen, offene Kommunikation, Respekt vor Grenzen, gemeinsames Lachen und die Fähigkeit, Konflikte fair zu lösen."),
    ],
    "Dating": [
        ("Wie finde ich den richtigen Partner?", "Werde dir zuerst klar, was dir wirklich wichtig ist. Sei authentisch, probiere verschiedene Wege aus und gib neuen Menschen eine echte Chance."),
        ("Was sollte man beim Dating beachten?", "Sei du selbst, stelle offene Fragen, höre aufmerksam zu und achte auf Red Flags. Nimm dir die Zeit, jemanden wirklich kennenzulernen."),
        ("Wie lange sollte man daten bevor man zusammenkommt?", "Es gibt keine feste Regel — wichtig ist, dass ihr euch gegenseitig gut kennt, Vertrauen aufgebaut habt und die gleichen Vorstellungen teilt."),
    ],
    "Psychologie": [
        ("Welche Rolle spielt Psychologie in Beziehungen?", "Psychologische Muster wie Bindungsstile, Kommunikationsmuster und unbewusste Überzeugungen beeinflussen maßgeblich, wie wir lieben und geliebt werden."),
        ("Kann man Beziehungsmuster verändern?", "Ja, durch Selbstreflexion, Therapie und bewusstes Üben neuer Verhaltensweisen. Der erste Schritt ist, die eigenen Muster zu erkennen."),
        ("Warum wiederholen sich Beziehungsprobleme?", "Oft liegen unbewusste Muster aus der Kindheit zugrunde. Der Bindungsstil und frühe Beziehungserfahrungen prägen, wen wir anziehen und wie wir in Beziehungen agieren."),
    ],
    "Kommunikation": [
        ("Wie kommuniziere ich besser in der Beziehung?", "Nutze Ich-Botschaften statt Vorwürfe, höre aktiv zu und sprich Probleme zeitnah an, statt sie aufzustauen."),
        ("Was tun wenn der Partner nicht reden will?", "Schaffe einen sicheren Rahmen ohne Druck. Manchmal hilft es, beim Spazierengehen zu reden statt am Küchentisch. Respektiere auch das Bedürfnis nach Verarbeitungszeit."),
    ],
    "Trennung": [
        ("Wie übersteht man eine Trennung?", "Lass dir Zeit zum Trauern, halte Kontaktsperre ein, konzentriere dich auf dich selbst und suche Unterstützung bei Freunden oder professioneller Hilfe."),
        ("Wann ist eine Trennung die richtige Entscheidung?", "Wenn Grundwerte nicht mehr übereinstimmen, Respekt fehlt, toxische Muster herrschen oder du dich dauerhaft unglücklich fühlst trotz Bemühungen."),
    ],
    "Selbstliebe": [
        ("Wie lerne ich mich selbst zu lieben?", "Beginne mit kleinen Schritten: Behandle dich so, wie du einen guten Freund behandeln würdest. Setze Grenzen, pflege deine Interessen und feiere kleine Erfolge."),
        ("Warum ist Selbstliebe wichtig für Beziehungen?", "Wer sich selbst wertschätzt, zieht gesündere Partner an, setzt klare Grenzen und kann Liebe geben, ohne sich dabei zu verlieren."),
    ],
    "Online-Dating": [
        ("Welche Dating-App ist die beste?", "Das kommt auf deine Ziele an. Für ernsthafte Beziehungen eignen sich Parship oder Bumble, für lockeres Kennenlernen Tinder. Probiere verschiedene Apps aus."),
        ("Wie schreibt man die erste Nachricht?", "Beziehe dich auf etwas Konkretes aus dem Profil, stelle eine offene Frage und sei authentisch. Vermeide Copy-Paste-Nachrichten und zu plumpe Anmachen."),
    ],
    "Flirten": [
        ("Wie flirte ich richtig?", "Augenkontakt halten, ehrlich lächeln, offene Fragen stellen und aufmerksam zuhören. Flirten heißt Interesse zeigen — nicht aufdringlich sein."),
        ("Woran erkenne ich Flirtsignale?", "Häufiger Augenkontakt, Lächeln, Berührungen am Arm, sich zu dir lehnen und echtes Interesse an deinen Antworten sind typische Flirtsignale."),
    ],
    "Intimität": [
        ("Wie bringt man mehr Intimität in die Beziehung?", "Intimität beginnt außerhalb des Schlafzimmers: Kleine Berührungen, tiefe Gespräche, Augenkontakt und ungeteilte Aufmerksamkeit schaffen emotionale Nähe."),
        ("Was tun bei nachlassender Leidenschaft?", "Das ist normal und kein Beziehungskiller. Schafft bewusste Rituale, probiert Neues aus und redet offen über eure Wünsche und Bedürfnisse."),
    ],
    "Red Flags": [
        ("Was sind typische Red Flags beim Dating?", "Kontrollverhalten, Love Bombing, fehlende Empathie, ständiges Lügen, Isolation von Freunden und das Nicht-Respektieren deiner Grenzen."),
        ("Wie reagiere ich auf Red Flags?", "Vertraue deinem Bauchgefühl, sprich die Warnsignale an und setze klare Grenzen. Wenn sich nichts ändert, ziehe Konsequenzen — dein Wohlbefinden kommt zuerst."),
    ],
    "Heilung": [
        ("Wie heilt man ein gebrochenes Herz?", "Lass alle Gefühle zu, ohne sie zu bewerten. Nimm dir Zeit, umgib dich mit Menschen die dir guttun, und sei geduldig mit dir selbst."),
        ("Wie lange dauert es, über jemanden hinwegzukommen?", "Das ist individuell verschieden. Als Faustregel gilt: Halb so lang wie die Beziehung gedauert hat. Aber sei nachsichtig mit dir — jeder heilt in seinem eigenen Tempo."),
    ],
    "Konflikte": [
        ("Wie löst man Konflikte in der Beziehung?", "Bleibt beim aktuellen Thema, nutzt Ich-Botschaften, macht Pausen wenn die Emotionen hochkochen, und sucht gemeinsam nach Lösungen statt nach Schuldigen."),
    ],
    "Vertrauen": [
        ("Wie baut man Vertrauen in einer Beziehung auf?", "Durch Zuverlässigkeit, Ehrlichkeit, offene Kommunikation und das Einhalten von Versprechen. Vertrauen wächst langsam und braucht konsistentes Handeln."),
    ],
    "Partnersuche": [
        ("Wo kann man am besten einen Partner finden?", "Über gemeinsame Hobbys, Freundeskreise, Vereine, Dating-Apps oder Veranstaltungen. Der beste Ort ist dort, wo du authentisch sein kannst."),
    ],
    "Familie": [
        ("Wie beeinflusst die Familie unsere Beziehungen?", "Unsere Herkunftsfamilie prägt unsere Bindungsmuster, Kommunikationsstile und Erwartungen an Beziehungen — oft unbewusst."),
    ],
    "Bindungstypen": [
        ("Welche Bindungstypen gibt es?", "Es gibt vier Haupttypen: sicher, ängstlich, vermeidend und ängstlich-vermeidend. Jeder Typ hat eigene Muster in Nähe und Distanz."),
    ],
}

# Title-based FAQ generators
def generate_title_faq(title, description):
    """Generate a FAQ question directly from the article title."""
    title_clean = re.sub(r'[:\—–\|].*', '', title).strip()

    faqs = []

    # "Was ist X?" pattern
    if any(w in title.lower() for w in ['erkennen', 'anzeichen', 'warnsignale', 'symptome']):
        subject = re.sub(r'\b(erkennen|anzeichen|warnsignale|symptome)\b', '', title_clean, flags=re.I).strip(' :—–')
        if subject and len(subject) > 3:
            faqs.append((
                f"Was ist {subject}?",
                description[:200] if description else f"{subject} beschreibt ein häufiges Phänomen in Beziehungen, das verschiedene Ursachen haben kann."
            ))

    # "Wie geht man mit X um?" pattern
    if any(w in title.lower() for w in ['überwinden', 'umgehen', 'bewältigen', 'heilen', 'lösen']):
        faqs.append((
            f"Kann man {title_clean.split(':')[0].strip()} wirklich überwinden?",
            "Ja, mit den richtigen Strategien, Geduld und oft auch professioneller Unterstützung ist Veränderung möglich. Der erste Schritt ist die Erkenntnis."
        ))

    # "Tipps" pattern
    if any(w in title.lower() for w in ['tipps', 'guide', 'ratgeber', 'anleitung']):
        faqs.append((
            f"Für wen ist dieser Ratgeber geeignet?",
            "Für alle, die sich in dieser Situation wiederfinden — egal ob am Anfang oder mittendrin. Die Tipps sind praxisnah und sofort umsetzbar."
        ))

    return faqs

def extract_keywords_from_title(title, tags, existing_keywords):
    """Generate keywords from title and tags."""
    if existing_keywords:
        return None  # Already has keywords

    keywords = []
    # Clean title
    title_clean = title.lower()
    title_clean = re.sub(r'[:\—–\|\d+]', ' ', title_clean)
    title_clean = re.sub(r'\b(der|die|das|ein|eine|und|oder|für|mit|von|zu|im|am|den|dem|des|ist|sind|wird|wie|was|wann|warum)\b', '', title_clean)

    # Extract meaningful 2-3 word phrases from title
    words = [w.strip() for w in title_clean.split() if len(w.strip()) > 2]

    # Full title as keyword (simplified)
    full_kw = re.sub(r'[:\—–\|].*', '', title.lower()).strip()
    if full_kw and len(full_kw) > 5:
        keywords.append(full_kw)

    # Add tag-based keywords
    for tag in tags:
        tag_lower = tag.lower().replace('-', ' ')
        if tag_lower not in [k.lower() for k in keywords]:
            keywords.append(tag_lower)

    # Add 2-word combos from title
    title_words = [w.strip() for w in title.lower().split() if len(w.strip()) > 3 and w not in ['der','die','das','ein','eine','und','oder','für','mit','von']]
    for i in range(len(title_words) - 1):
        combo = f"{title_words[i]} {title_words[i+1]}"
        if combo not in keywords and len(combo) > 8:
            keywords.append(combo)
            if len(keywords) >= 6:
                break

    return keywords[:6] if keywords else None


def process_articles():
    files = sorted(os.listdir(BLOG_DIR))
    faq_added = 0
    kw_added = 0

    for fname in files:
        if not fname.endswith('.md'):
            continue

        fpath = os.path.join(BLOG_DIR, fname)
        with open(fpath, 'r') as f:
            content = f.read()

        # Parse frontmatter
        fm_match = re.match(r'^---\n(.*?)\n---', content, re.DOTALL)
        if not fm_match:
            continue

        frontmatter = fm_match.group(1)
        body_start = fm_match.end()

        # Extract fields
        title_m = re.search(r'^title:\s*["\']?(.+?)["\']?\s*$', frontmatter, re.M)
        title = title_m.group(1) if title_m else fname.replace('.md', '')

        desc_m = re.search(r'^description:\s*["\']?(.+?)["\']?\s*$', frontmatter, re.M)
        description = desc_m.group(1) if desc_m else ""

        # Extract tags
        tags = []
        tags_m = re.search(r'^tags:\s*\[(.+?)\]', frontmatter, re.M)
        if tags_m:
            tags = [t.strip().strip('"\'') for t in tags_m.group(1).split(',')]
        else:
            tags_block = re.search(r'^tags:\s*\n((?:\s*-\s*.+\n)*)', frontmatter, re.M)
            if tags_block:
                tags = [re.sub(r'^\s*-\s*["\']?|["\']?\s*$', '', l) for l in tags_block.group(1).strip().split('\n')]

        modified = False

        # === ADD FAQ ===
        has_faq = 'question:' in frontmatter
        if not has_faq:
            faqs = []

            # Get tag-based FAQs (pick 2 from matching tags)
            for tag in tags:
                if tag in FAQ_TEMPLATES:
                    available = FAQ_TEMPLATES[tag]
                    picked = random.sample(available, min(1, len(available)))
                    faqs.extend(picked)
                    if len(faqs) >= 2:
                        break

            # Add title-based FAQ
            title_faqs = generate_title_faq(title, description)
            faqs.extend(title_faqs)

            # Ensure we have at least 3 FAQs
            if len(faqs) < 3:
                generic = [
                    ("Ist dieser Ratgeber kostenlos?", "Ja, alle Artikel auf Herzblatt Journal sind komplett kostenlos. Wir finanzieren uns über Empfehlungen und Affiliate-Links."),
                    ("Basieren die Tipps auf wissenschaftlichen Erkenntnissen?", "Wir stützen unsere Ratgeber auf aktuelle psychologische Forschung und die Erfahrung unserer Experten aus der Praxis."),
                    ("Kann ich die Tipps sofort umsetzen?", "Ja, unsere Ratgeber sind praxisnah geschrieben. Du findest konkrete Schritte, die du direkt in deinem Alltag anwenden kannst."),
                ]
                for g in generic:
                    if len(faqs) >= 3:
                        break
                    if g not in faqs:
                        faqs.append(g)

            # Deduplicate and limit to 3
            seen = set()
            unique_faqs = []
            for q, a in faqs:
                if q not in seen:
                    seen.add(q)
                    unique_faqs.append((q, a))
            faqs = unique_faqs[:3]

            if faqs:
                # Build FAQ YAML
                faq_yaml = 'faq:\n'
                for q, a in faqs:
                    q_escaped = q.replace('"', '\\"')
                    a_escaped = a.replace('"', '\\"')
                    faq_yaml += f'  - question: "{q_escaped}"\n    answer: "{a_escaped}"\n'

                # Check if there's already an empty faq: [] or faq: \n
                if re.search(r'^faq:\s*\[\s*\]', frontmatter, re.M):
                    frontmatter = re.sub(r'^faq:\s*\[\s*\]', faq_yaml.rstrip(), frontmatter, flags=re.M)
                elif 'faq:' not in frontmatter:
                    # Add before draft: or at end of frontmatter
                    if 'draft:' in frontmatter:
                        frontmatter = frontmatter.replace('draft:', faq_yaml + 'draft:')
                    else:
                        frontmatter += '\n' + faq_yaml

                faq_added += 1
                modified = True

        # === ADD KEYWORDS ===
        has_keywords = re.search(r'^keywords:\s*\[.+\]', frontmatter, re.M) or \
                       (re.search(r'^keywords:\s*\n\s+-', frontmatter, re.M))

        if not has_keywords:
            keywords = extract_keywords_from_title(title, tags, None)
            if keywords:
                kw_yaml = 'keywords: [' + ', '.join(f'"{k}"' for k in keywords) + ']'

                if re.search(r'^keywords:\s*\[\s*\]', frontmatter, re.M):
                    frontmatter = re.sub(r'^keywords:\s*\[\s*\]', kw_yaml, frontmatter, flags=re.M)
                elif 'keywords:' not in frontmatter:
                    if 'description:' in frontmatter:
                        frontmatter = re.sub(
                            r'^(description:\s*.+)$',
                            r'\1\n' + kw_yaml,
                            frontmatter,
                            count=1,
                            flags=re.M
                        )
                    else:
                        frontmatter += '\n' + kw_yaml

                kw_added += 1
                modified = True

        if modified:
            new_content = '---\n' + frontmatter + '\n---' + content[body_start:]
            with open(fpath, 'w') as f:
                f.write(new_content)

    print(f"FAQ added to {faq_added} articles")
    print(f"Keywords added to {kw_added} articles")

process_articles()
