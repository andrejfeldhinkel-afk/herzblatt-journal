#!/usr/bin/env python3
"""Generate 20 more TikTok carousel posts for Herzblatt Journal."""
from PIL import Image, ImageDraw, ImageFont
import os, textwrap, re

OUT = "/sessions/clever-youthful-gates/mnt/Herzblatt Journal/tiktok"
os.makedirs(OUT, exist_ok=True)

W, H = 1080, 1350

# Try to find a bold font
FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
]
FONT_PATH = next((p for p in FONT_CANDIDATES if os.path.exists(p)), None)

def font(size):
    return ImageFont.truetype(FONT_PATH, size) if FONT_PATH else ImageFont.load_default()

# Theme palettes (bg_top, bg_bot, text, accent)
THEMES = {
    "pink":   ((255, 182, 193), (255, 105, 135), (40, 20, 40),  (255, 255, 255)),
    "dark":   ((30, 15, 40),    (70, 25, 80),    (255, 255, 255), (255, 180, 200)),
    "cream":  ((255, 243, 230), (255, 214, 194), (60, 30, 40),  (200, 60, 90)),
    "rose":   ((255, 228, 225), (255, 160, 180), (50, 20, 40),  (180, 40, 80)),
    "night":  ((20, 20, 50),    (60, 30, 90),    (255, 255, 255), (255, 200, 220)),
    "sunset": ((255, 180, 140), (220, 80, 120),  (40, 20, 30),  (255, 255, 255)),
}

def gradient_bg(theme):
    top, bot, _, _ = THEMES[theme]
    img = Image.new("RGB", (W, H), top)
    d = ImageDraw.Draw(img)
    for y in range(H):
        t = y / H
        r = int(top[0] * (1-t) + bot[0] * t)
        g = int(top[1] * (1-t) + bot[1] * t)
        b = int(top[2] * (1-t) + bot[2] * t)
        d.line([(0, y), (W, y)], fill=(r, g, b))
    return img

def wrap(text, f, max_width):
    words = text.split()
    lines, cur = [], ""
    for w in words:
        test = (cur + " " + w).strip()
        bbox = f.getbbox(test)
        if bbox[2] - bbox[0] <= max_width:
            cur = test
        else:
            if cur: lines.append(cur)
            cur = w
    if cur: lines.append(cur)
    return lines

def draw_centered(img, text, f, color, y_center, max_width=940):
    d = ImageDraw.Draw(img)
    lines = wrap(text, f, max_width)
    bbox = f.getbbox("Ag")
    lh = (bbox[3] - bbox[1]) + 18
    total = lh * len(lines)
    y = y_center - total // 2
    for ln in lines:
        bb = f.getbbox(ln)
        x = (W - (bb[2] - bb[0])) // 2
        d.text((x, y), ln, font=f, fill=color)
        y += lh

def slide(theme, top_label, headline, body, footer, filename, number=None):
    img = gradient_bg(theme)
    d = ImageDraw.Draw(img)
    _, _, text_col, accent = THEMES[theme]
    # top pill label
    if top_label:
        fl = font(42)
        bb = fl.getbbox(top_label)
        pad_x, pad_y = 30, 14
        tw = bb[2] - bb[0]; th = bb[3] - bb[1]
        px = (W - tw) // 2
        py = 80
        d.rounded_rectangle([px-pad_x, py-pad_y, px+tw+pad_x, py+th+pad_y+10], radius=40, fill=accent)
        d.text((px, py), top_label, font=fl, fill=(30, 15, 40))
    # number big
    if number is not None:
        fn = font(260)
        bb = fn.getbbox(str(number))
        nx = (W - (bb[2]-bb[0])) // 2
        d.text((nx, 180), str(number), font=fn, fill=accent)
    # headline
    if headline:
        fh = font(78 if len(headline) > 30 else 92)
        draw_centered(img, headline, fh, text_col, 560 if number is None else 640)
    # body
    if body:
        fb = font(52)
        draw_centered(img, body, fb, text_col, 900 if number is None else 960, max_width=960)
    # footer
    ff = font(36)
    bb = ff.getbbox(footer)
    d.text(((W - (bb[2]-bb[0]))//2, H - 90), footer, font=ff, fill=text_col)
    img.save(os.path.join(OUT, filename), quality=92)

def slug(s):
    s = s.lower()
    s = re.sub(r"[äöüß]", lambda m: {"ä":"ae","ö":"oe","ü":"ue","ß":"ss"}[m.group()], s)
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s

# POSTS: list of dicts
POSTS = [
    {
        "num": 6, "theme": "dark", "label": "LOVE BOMBING",
        "title": "6 Red Flags in den ersten 14 Tagen",
        "footer": "herzblatt-journal.com",
        "slides": [
            ("HOOK", "6 Red Flags in den ersten 14 Tagen", "Save this. Seriously."),
            ("#1", "Er sagt nach 3 Tagen 'Ich liebe dich'", "Das ist keine Liebe. Das ist Love Bombing."),
            ("#2", "Will sofort exklusiv sein", "Ohne dich zu kennen."),
            ("#3", "Überhäuft dich mit Geschenken", "Damit du dich schuldig fühlst."),
            ("#4", "Plant Urlaub in Woche 1", "Bindet dich emotional."),
            ("#5", "Ständige Kontaktaufnahme", "Gefühlt 100 Nachrichten am Tag."),
            ("#6", "'Du bist anders als alle'", "Spoiler: Das sagt er zu jeder."),
            ("STOP", "Gesunde Liebe braucht Zeit", "Nicht Druck."),
            ("READ", "Voller Guide auf dem Blog", "Link in Bio"),
        ],
    },
    {
        "num": 7, "theme": "pink", "label": "BINDUNGSSTIL",
        "title": "Welcher Bindungstyp bist du?",
        "footer": "herzblatt-journal.com",
        "slides": [
            ("HOOK", "Welcher Bindungstyp bist du?", "Teste dich selbst."),
            ("TYP 1", "Sicher gebunden", "Du kannst Nähe UND Freiheit."),
            ("TYP 2", "Ängstlich gebunden", "Du brauchst ständige Bestätigung."),
            ("TYP 3", "Vermeidend gebunden", "Nähe fühlt sich erdrückend an."),
            ("TYP 4", "Desorganisiert", "Push & Pull. Chaos."),
            ("WARUM", "Bindungsstile entstehen in der Kindheit", "Aber sie sind veränderbar."),
            ("TIPP", "Heilung ist möglich", "In sicheren Beziehungen."),
            ("READ", "Voller Test im Blog", "Link in Bio"),
        ],
    },
    {
        "num": 8, "theme": "cream", "label": "DATING DEUTSCHLAND",
        "title": "5 Dinge die du am 1. Date NIE tun solltest",
        "footer": "herzblatt-journal.com",
        "slides": [
            ("HOOK", "5 Fails am ersten Date", "Mach das nicht."),
            ("#1", "Über die/den Ex reden", "Sofortiger Stimmungskiller."),
            ("#2", "Zu viel über dich reden", "Dating ist ein Dialog."),
            ("#3", "Handy auf dem Tisch", "Signal: Du bist mir nicht wichtig."),
            ("#4", "Komplimente fishen", "Wirkt bedürftig."),
            ("#5", "Über Zukunft fantasieren", "Kinder? Hochzeit? Woah, zu früh."),
            ("BESSER", "Sei neugierig. Sei präsent.", "Das reicht."),
            ("READ", "Mehr Dating-Tipps", "Link in Bio"),
        ],
    },
    {
        "num": 9, "theme": "night", "label": "NO CONTACT",
        "title": "No Contact: Die 7 Tage Challenge",
        "footer": "herzblatt-journal.com",
        "slides": [
            ("HOOK", "No Contact: 7 Tage Challenge", "Klappt wirklich."),
            ("TAG 1", "Blockiere ihn überall", "Ja, auch WhatsApp."),
            ("TAG 2", "Lösche Fotos in einen Archiv-Ordner", "Nicht ansehen."),
            ("TAG 3", "Ruf eine Freundin an", "Sprich laut über deine Gefühle."),
            ("TAG 4", "Mache Sport", "Dopamin hilft."),
            ("TAG 5", "Schreibe einen Abschiedsbrief", "Verschick ihn NICHT."),
            ("TAG 6", "Mache etwas Neues", "Was du nie gewagt hast."),
            ("TAG 7", "Du bist stolz auf dich", "Das ist erst der Anfang."),
            ("READ", "Kompletter Plan im Blog", "Link in Bio"),
        ],
    },
    {
        "num": 10, "theme": "rose", "label": "SELBSTWERT",
        "title": "5 Sätze die deinen Selbstwert killen",
        "footer": "herzblatt-journal.com",
        "slides": [
            ("HOOK", "5 Sätze, die dein Selbstwert zerstören", "Hör auf, sie zu sagen."),
            ("#1", "'Ich bin halt so'", "Nein. Du kannst dich verändern."),
            ("#2", "'Ohne ihn bin ich nichts'", "Doch. Du bist alles."),
            ("#3", "'Ich habe ihn/sie nicht verdient'", "Du verdienst Liebe. Punkt."),
            ("#4", "'Ich bin zu viel'", "Die richtige Person findet dich perfekt."),
            ("#5", "'Ich bin schuld'", "Nein. Nicht immer."),
            ("TIPP", "Sprich mit dir wie mit deiner besten Freundin", "Mit Mitgefühl."),
            ("READ", "Mehr zum Thema", "Link in Bio"),
        ],
    },
    {
        "num": 11, "theme": "sunset", "label": "GREEN FLAGS",
        "title": "7 Green Flags die oft übersehen werden",
        "footer": "herzblatt-journal.com",
        "slides": [
            ("HOOK", "7 Green Flags die du ÜBERSIEHST", "Diese Männer sind Gold."),
            ("#1", "Er hält seine Versprechen", "Auch die kleinen."),
            ("#2", "Er redet gut über seine Ex", "Oder schweigt respektvoll."),
            ("#3", "Seine Freunde sind fest", "Langzeit-Freundschaften = Loyalität."),
            ("#4", "Er fragt wie es dir geht", "Und hört wirklich zu."),
            ("#5", "Er mag seine Mama", "Gesund, nicht klammernd."),
            ("#6", "Er kann Nein sagen", "Hat Grenzen."),
            ("#7", "Er macht dich entspannt", "Kein Herzrasen. Frieden."),
            ("READ", "Mehr auf dem Blog", "Link in Bio"),
        ],
    },
    {
        "num": 12, "theme": "dark", "label": "TOXISCH",
        "title": "Silent Treatment: Warum es Missbrauch ist",
        "footer": "herzblatt-journal.com",
        "slides": [
            ("HOOK", "Silent Treatment ist emotionaler Missbrauch", "Ja, wirklich."),
            ("WAS", "Was ist Silent Treatment?", "Er ignoriert dich tagelang als Strafe."),
            ("WARUM", "Warum es so weh tut", "Das Hirn verarbeitet es wie körperlichen Schmerz."),
            ("#1", "Es ist Kontrolle", "Er zeigt: Ich bestimme die Nähe."),
            ("#2", "Es ist Bestrafung", "Für Dinge, die du nicht mal weißt."),
            ("#3", "Es zerstört Vertrauen", "Du läufst auf Eierschalen."),
            ("WAS TUN", "Ansprechen. Grenze setzen.", "Oder gehen."),
            ("READ", "Mehr dazu im Blog", "Link in Bio"),
        ],
    },
    {
        "num": 13, "theme": "pink", "label": "SINGLE SEIN",
        "title": "5 Gründe warum Single-Zeit ein Geschenk ist",
        "footer": "herzblatt-journal.com",
        "slides": [
            ("HOOK", "Single zu sein ist kein Fehler", "Es ist ein Geschenk."),
            ("#1", "Du lernst dich kennen", "Wirklich. Ohne Spiegel."),
            ("#2", "Du heilst alte Wunden", "Ohne einen neuen Trigger im Bett."),
            ("#3", "Du baust Hobbys auf", "Die DIR Freude machen."),
            ("#4", "Du wirst wählerisch", "Nie wieder 'irgendwer'."),
            ("#5", "Du bist deine beste Gesellschaft", "Endlich."),
            ("TIPP", "Single-Sein ist kein Warteraum", "Es ist Leben."),
            ("READ", "Mehr lesen", "Link in Bio"),
        ],
    },
    {
        "num": 14, "theme": "cream", "label": "FLIRTEN",
        "title": "Wie du zeigst, dass du Interesse hast",
        "footer": "herzblatt-journal.com",
        "slides": [
            ("HOOK", "So zeigst du Interesse", "Ohne peinlich zu wirken."),
            ("#1", "Augenkontakt. 3 Sekunden.", "Dann lächeln."),
            ("#2", "Berühre kurz seinen Arm", "Einmal. Kurz. Bedeutungsvoll."),
            ("#3", "Stelle Fragen", "Echte. Keine Small-Talk-Fragen."),
            ("#4", "Lache über seine Witze", "Wenn sie echt witzig sind."),
            ("#5", "Sei ein bisschen mutig", "Schlag das Wiedersehen vor."),
            ("TIPP", "Selbstsicher > perfekt", "Immer."),
            ("READ", "Flirt-Guide im Blog", "Link in Bio"),
        ],
    },
    {
        "num": 15, "theme": "night", "label": "EX ZURÜCK",
        "title": "Soll ich meinen Ex zurücknehmen? 5 Checks",
        "footer": "herzblatt-journal.com",
        "slides": [
            ("HOOK", "Ex zurücknehmen? 5 Fragen vorher", "Ehrlich beantworten."),
            ("#1", "Hat ER sich verändert?", "Oder nur seine Worte?"),
            ("#2", "Warum ist er zurück?", "Einsamkeit? Oder echte Einsicht?"),
            ("#3", "Fehlt er dir oder die Idee?", "Großer Unterschied."),
            ("#4", "Würdest du ihn heute wählen?", "Als fremde Person?"),
            ("#5", "Was hat sich fundamental geändert?", "Nichts? Dann geh."),
            ("TIPP", "Meist: 'Das gleiche' ≠ 'diesmal anders'", "Bleib stark."),
            ("READ", "Mehr im Blog", "Link in Bio"),
        ],
    },
    {
        "num": 16, "theme": "rose", "label": "SELF CARE",
        "title": "5 Minuten Self Care für schlechte Tage",
        "footer": "herzblatt-journal.com",
        "slides": [
            ("HOOK", "5-Minuten Self Care", "Für wenn alles zu viel ist."),
            ("MINUTE 1", "Tief atmen. 4-7-8 Methode.", "Aktiviert das Nervensystem."),
            ("MINUTE 2", "Kaltes Wasser ins Gesicht", "Vagus-Nerv-Reset."),
            ("MINUTE 3", "Eine Person anrufen", "Die dich liebt."),
            ("MINUTE 4", "Drei Dinge notieren", "Für die du dankbar bist."),
            ("MINUTE 5", "Eine Sache tun", "Die sich gut anfühlt."),
            ("TIPP", "Kleine Schritte. Jeden Tag.", "Das ist Heilung."),
            ("READ", "Mehr Self-Care Ideen", "Link in Bio"),
        ],
    },
    {
        "num": 17, "theme": "sunset", "label": "GRENZEN",
        "title": "5 Sätze um Grenzen zu setzen",
        "footer": "herzblatt-journal.com",
        "slides": [
            ("HOOK", "5 Grenzen-Sätze zum auswendig lernen", "Save this!"),
            ("#1", "'Das passt mir nicht.'", "Punkt. Kein Aber."),
            ("#2", "'Ich brauche Bedenkzeit.'", "Nein ist ein vollständiger Satz."),
            ("#3", "'So möchte ich nicht sprechen.'", "Legt den Ton fest."),
            ("#4", "'Ich bin dafür nicht verantwortlich.'", "Nein zum Schuldgefühl."),
            ("#5", "'Wir beenden dieses Gespräch.'", "Wenn es toxisch wird."),
            ("TIPP", "Grenzen sind Liebe", "Zu dir selbst."),
            ("READ", "Grenzen-Guide", "Link in Bio"),
        ],
    },
    {
        "num": 18, "theme": "dark", "label": "HEILUNG",
        "title": "3 Stufen der emotionalen Heilung",
        "footer": "herzblatt-journal.com",
        "slides": [
            ("HOOK", "3 Stufen der Heilung", "Bei welcher bist du?"),
            ("STUFE 1", "FÜHLEN", "Alles fühlen, was du unterdrückt hast."),
            ("WARUM", "Unterdrückte Gefühle heilen nicht", "Sie verstecken sich im Körper."),
            ("STUFE 2", "VERSTEHEN", "Warum du so fühlst."),
            ("WIE", "Therapie. Journaling. Gespräche.", "Muster erkennen."),
            ("STUFE 3", "LOSLASSEN", "Nicht vergessen. Integrieren."),
            ("TIPP", "Heilung ist nicht linear", "Zurückfallen gehört dazu."),
            ("READ", "Heilungs-Guide", "Link in Bio"),
        ],
    },
    {
        "num": 19, "theme": "pink", "label": "DATING APPS",
        "title": "Dating App Profil: 6 Dos & Don'ts",
        "footer": "herzblatt-journal.com",
        "slides": [
            ("HOOK", "Dating App Profil fixen", "In 6 Schritten."),
            ("DO #1", "Gesichts-Foto ohne Filter", "Lächelnd. Klar. Ehrlich."),
            ("DO #2", "Hobby-Foto zeigen", "Was du wirklich machst."),
            ("DO #3", "Bio mit Persönlichkeit", "Keine leeren Phrasen."),
            ("DON'T #1", "Kein Gruppenfoto als Erstes", "Welcher bist du?"),
            ("DON'T #2", "Keine Sonnenbrille auf ALLEN Fotos", "Zeig dein Gesicht."),
            ("DON'T #3", "Keine Ex-Frau ausgeschnitten", "Peinlich."),
            ("READ", "Profil-Guide komplett", "Link in Bio"),
        ],
    },
    {
        "num": 20, "theme": "cream", "label": "BEZIEHUNG",
        "title": "5 Fragen die jede gute Beziehung klärt",
        "footer": "herzblatt-journal.com",
        "slides": [
            ("HOOK", "5 Fragen die jede Beziehung klärt", "Vor Monat 6."),
            ("#1", "Was bedeutet Liebe für dich?", "Definitionen matter."),
            ("#2", "Wie gehst du mit Konflikten um?", "Schweigen? Reden? Schreien?"),
            ("#3", "Was sind deine Deal-Breaker?", "Sag sie JETZT."),
            ("#4", "Was brauchst du, um dich sicher zu fühlen?", "Jeder braucht was anderes."),
            ("#5", "Wo siehst du uns in 2 Jahren?", "Mismatch = Problem."),
            ("TIPP", "Gute Gespräche = gute Beziehung", "Immer."),
            ("READ", "Beziehungs-Fragen Liste", "Link in Bio"),
        ],
    },
    {
        "num": 21, "theme": "night", "label": "TRAUMA BONDING",
        "title": "Trauma Bonding: 6 Zeichen",
        "footer": "herzblatt-journal.com",
        "slides": [
            ("HOOK", "Trauma Bonding erkennen", "6 klare Zeichen."),
            ("#1", "Hot & Cold", "Himmel, Hölle, Himmel, Hölle."),
            ("#2", "Du verteidigst sein Verhalten", "Vor deinen Freunden."),
            ("#3", "Versöhnungen fühlen sich extrem an", "Wie Drogen."),
            ("#4", "Du hast Angst ihn zu verlieren", "Obwohl er dich verletzt."),
            ("#5", "Deine Freunde sind besorgt", "Du hörst nicht zu."),
            ("#6", "Du bist isoliert", "Nach und nach."),
            ("STOP", "Das ist keine Liebe", "Das ist Sucht."),
            ("READ", "Mehr zum Thema", "Link in Bio"),
        ],
    },
    {
        "num": 22, "theme": "rose", "label": "INNERES KIND",
        "title": "Inneres Kind heilen: 5 Schritte",
        "footer": "herzblatt-journal.com",
        "slides": [
            ("HOOK", "Inneres Kind heilen", "5 Schritte."),
            ("#1", "Erkenne es an", "Es ist Teil von dir."),
            ("#2", "Sprich mit ihm", "'Ich bin jetzt hier.'"),
            ("#3", "Finde alte Fotos", "Sieh dich mit Mitgefühl."),
            ("#4", "Gib ihm was es brauchte", "Zärtlichkeit. Sicherheit."),
            ("#5", "Sei der Erwachsene", "Den du damals gebraucht hast."),
            ("TIPP", "Heilung kommt von innen", "Niemand kann es für dich tun."),
            ("READ", "Inneres Kind Guide", "Link in Bio"),
        ],
    },
    {
        "num": 23, "theme": "sunset", "label": "EIFERSUCHT",
        "title": "Eifersucht: 4 Ursachen & was hilft",
        "footer": "herzblatt-journal.com",
        "slides": [
            ("HOOK", "Eifersucht verstehen", "4 Ursachen."),
            ("#1", "Geringer Selbstwert", "'Ich bin nicht genug.'"),
            ("#2", "Alte Verletzungen", "Vorheriger Betrug sitzt tief."),
            ("#3", "Unklare Absprachen", "Keine Grenzen = Angst."),
            ("#4", "Projektion", "Du weißt was DU tun würdest."),
            ("WAS HILFT", "Selbstwert stärken", "Ehrliche Gespräche führen."),
            ("TIPP", "Eifersucht ist kein Liebesbeweis", "Es ist Angst."),
            ("READ", "Mehr dazu", "Link in Bio"),
        ],
    },
    {
        "num": 24, "theme": "dark", "label": "BREADCRUMBING",
        "title": "Breadcrumbing: Wenn er dich hinhält",
        "footer": "herzblatt-journal.com",
        "slides": [
            ("HOOK", "Breadcrumbing erkennen", "Er hält dich hin."),
            ("WAS", "Was ist Breadcrumbing?", "Kleine 'Brotkrumen' der Aufmerksamkeit."),
            ("#1", "Sporadische Nachrichten", "Nach Wochen Funkstille."),
            ("#2", "Vages 'Bald-treffen'", "Das nie passiert."),
            ("#3", "Late-Night Texts", "Nur, wenn er Lust hat."),
            ("#4", "Keine echten Pläne", "Du bist Plan B."),
            ("STOP", "Du bist ein voller Laib", "Keine Krume."),
            ("READ", "Mehr Guides", "Link in Bio"),
        ],
    },
    {
        "num": 25, "theme": "pink", "label": "SELBSTLIEBE",
        "title": "7 Morgen-Rituale für mehr Selbstliebe",
        "footer": "herzblatt-journal.com",
        "slides": [
            ("HOOK", "7 Morgen-Rituale", "Für mehr Selbstliebe."),
            ("#1", "Spiegel-Affirmation", "'Ich bin genug.' Laut."),
            ("#2", "Ein Glas Wasser", "Zuerst. Vor allem."),
            ("#3", "3 Minuten Dehnen", "Körper wach machen."),
            ("#4", "Dankbarkeits-Notiz", "3 Dinge."),
            ("#5", "Tages-Intention", "Wie willst du dich fühlen?"),
            ("#6", "Kein Handy 20 Min", "Starte mit DIR."),
            ("#7", "Lächel dich an", "Im Spiegel."),
            ("READ", "Rituale-Guide", "Link in Bio"),
        ],
    },
]

for post in POSTS:
    n = post["num"]
    theme = post["theme"]
    label = post["label"]
    footer = post["footer"]
    for i, (tag, headline, body) in enumerate(post["slides"], start=1):
        fname = f"post{n}_{slug(post['title'])[:30]}_slide{i}.jpg"
        # first slide: big headline, no number; later slides with # tag show number
        number = None
        if tag.startswith("#") and tag[1:].isdigit():
            number = int(tag[1:])
        slide(theme, label if i == 1 else tag, headline, body, footer, fname, number=number)
    print(f"Post {n} done")

print("ALL DONE")
