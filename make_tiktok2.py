#!/usr/bin/env python3
from PIL import Image, ImageDraw, ImageFont
import os

OUT = "/sessions/clever-youthful-gates/mnt/Herzblatt Journal/tiktok"
os.makedirs(OUT, exist_ok=True)

W, H = 1080, 1350
PINK = (236, 64, 122)
DARK = (40, 25, 35)
CREAM = (255, 246, 245)
WHITE = (255, 255, 255)
BOLD = "/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf"

def font(size): return ImageFont.truetype(BOLD, size)

def gradient_bg(c1, c2):
    img = Image.new("RGB", (W, H), c1)
    d = ImageDraw.Draw(img)
    for y in range(H):
        t = y / H
        r = int(c1[0]*(1-t) + c2[0]*t); g = int(c1[1]*(1-t) + c2[1]*t); b = int(c1[2]*(1-t) + c2[2]*t)
        d.line([(0, y), (W, y)], fill=(r, g, b))
    return img

def wrap_text(text, font_obj, max_width):
    words = text.split()
    lines, cur = [], ""
    for w in words:
        test = (cur + " " + w).strip()
        if font_obj.getlength(test) <= max_width: cur = test
        else:
            if cur: lines.append(cur)
            cur = w
    if cur: lines.append(cur)
    return lines

def slide(filename, kicker, title, body, slide_no, total, theme="light"):
    if theme == "dark":
        bg = gradient_bg((50, 20, 40), (20, 10, 25))
        title_color = WHITE; body_color = (230, 220, 225); kicker_color = PINK
    elif theme == "pink":
        bg = gradient_bg((255, 120, 150), (236, 64, 122))
        title_color = WHITE; body_color = WHITE; kicker_color = (255, 240, 245)
    else:
        bg = gradient_bg(CREAM, (255, 230, 235))
        title_color = DARK; body_color = (70, 50, 60); kicker_color = PINK
    d = ImageDraw.Draw(bg)
    d.text((W//2, 60), "HERZBLATT JOURNAL ♥", font=font(26), fill=kicker_color, anchor="mt")
    d.text((W-60, 60), f"{slide_no}/{total}", font=font(24), fill=kicker_color, anchor="rt")
    if kicker:
        d.text((W//2, 220), kicker.upper(), font=font(32), fill=kicker_color, anchor="mt")
    title_lines = wrap_text(title, font(72), W - 140)
    y = 300
    for line in title_lines:
        d.text((W//2, y), line, font=font(72), fill=title_color, anchor="mt"); y += 90
    if body:
        body_lines = []
        for para in body.split("\n"):
            body_lines.extend(wrap_text(para, font(40), W - 160))
            body_lines.append("")
        y = max(y + 60, 700)
        for line in body_lines:
            d.text((W//2, y), line, font=font(40), fill=body_color, anchor="mt"); y += 56
    if slide_no < total:
        d.text((W//2, H - 80), "→ weiter swipen", font=font(28), fill=kicker_color, anchor="mt")
    else:
        d.text((W//2, H - 110), "♥ herzblatt-journal.com", font=font(32), fill=kicker_color, anchor="mt")
        d.text((W//2, H - 60), "Folge für mehr", font=font(26), fill=kicker_color, anchor="mt")
    bg.save(f"{OUT}/{filename}", "JPEG", quality=92)

# POST 3: Gaslighting
P3 = "post3_gaslighting"
slides_3 = [
    ("hook", "7 Sätze die\nGaslighter\nsagen", "und was sie\nwirklich meinen", "pink"),
    ("Satz #1", "„Das hast du\ndir eingebildet\"", "Übersetzung:\n„Ich hoffe, du\nzweifelst an dir,\ndamit ich nicht\nverantwortlich bin.\"", "light"),
    ("Satz #2", "„Du bist zu\nempfindlich\"", "Übersetzung:\n„Deine berechtigten\nGefühle sind\nfür mich unbequem.\"", "light"),
    ("Satz #3", "„Das war nur\nein Witz\"", "Übersetzung:\n„Ich wollte dich\nverletzen, ohne\nVerantwortung zu\nübernehmen.\"", "light"),
    ("Satz #4", "„Du erinnerst\ndich falsch\"", "Übersetzung:\n„Wenn ich es leugne,\nverlierst du dein\nVertrauen in dich.\"", "light"),
    ("Satz #5", "„Alle finden,\ndass du übertreibst\"", "Übersetzung:\n„Ich isoliere dich.\nNiemand denkt das\naußer mir.\"", "light"),
    ("Satz #6", "„Du machst\nimmer Drama\"", "Übersetzung:\n„Sag nichts, hab\nkeine Bedürfnisse,\nfunktioniere einfach.\"", "light"),
    ("Satz #7", "„Ohne mich\nbist du nichts\"", "Übersetzung:\n„Wenn du das glaubst,\nbleibst du.\nUnd ich gewinne.\"", "light"),
    ("Was tun?", "Vertraue\ndeiner Wahrnehmung", "Schreib auf,\nwas passiert.\nSprich mit jemandem,\ndem du vertraust.\n\nGaslighting ist\nMissbrauch.", "pink"),
    ("ende", "Mehr lesen?", "herzblatt-journal.com\nVoller Guide ♥", "dark"),
]
for i, (k, t, b, theme) in enumerate(slides_3, 1):
    slide(f"{P3}_slide{i}.jpg", k if k not in ("hook","ende") else "", t, b, i, len(slides_3), theme)

# POST 4: Phasen nach Trennung
P4 = "post4_trennungsphasen"
slides_4 = [
    ("hook", "Die 6 Phasen\nnach einer\nTrennung", "und wie lange\njede dauert", "pink"),
    ("Phase 1", "Schock", "1–7 Tage\n\nDu funktionierst nicht.\nDu schläfst nicht.\nDu kannst es nicht\nfassen.", "light"),
    ("Phase 2", "Verleugnung", "1–4 Wochen\n\n„Vielleicht kommt er\nzurück.\"\n„Es war doch nicht\nso schlimm.\"\n\nNormal. Lass es kommen.", "light"),
    ("Phase 3", "Wut", "2–8 Wochen\n\nDu hasst ihn.\nDu hasst dich.\nDu hasst alles.\n\nDie Wut ist okay.\nSie ist Energie.", "light"),
    ("Phase 4", "Trauer", "1–6 Monate\n\nDu weinst viel.\nDie Welt ist grau.\nDu vermisst ihn —\nund den, der du\nmit ihm warst.", "light"),
    ("Phase 5", "Akzeptanz", "3–12 Monate\n\nDu denkst noch an ihn.\nAber es tut weniger weh.\n\nDu beginnst,\ndich neu zu finden.", "light"),
    ("Phase 6", "Neuanfang", "6+ Monate\n\nDu lachst wieder.\nDu willst wieder\netwas erleben.\n\nDu bist nicht mehr\ndieselbe — und das\nist gut.", "light"),
    ("Wichtig", "Es ist keine\ngerade Linie", "Du wirst Phasen\nzurückspringen.\nDas ist normal.\n\nHeilung verläuft\nin Spiralen.", "pink"),
    ("ende", "Du schaffst das.", "herzblatt-journal.com\nMehr Hilfe ♥", "dark"),
]
for i, (k, t, b, theme) in enumerate(slides_4, 1):
    slide(f"{P4}_slide{i}.jpg", k if k not in ("hook","ende") else "", t, b, i, len(slides_4), theme)

# POST 5: Verdeckter Narzissmus
P5 = "post5_verdeckter-narzissmus"
slides_5 = [
    ("hook", "Verdeckter\nNarzissmus", "6 stille\nWarnzeichen", "pink"),
    ("Zeichen #1", "Das ewige\nOpfer", "Egal was passiert —\ner ist immer\nder Verletzte.\n\nNiemand versteht ihn.\nAlle tun ihm Unrecht.", "light"),
    ("Zeichen #2", "Stille\nBestrafung", "Statt Streit:\nSchweigen.\nTagelang.\n\nDu sollst raten,\nwas du falsch\ngemacht hast.", "light"),
    ("Zeichen #3", "Subtile\nAbwertung", "„Schönes Kleid —\nfür dich.\"\n„Erstaunlich, dass\ndu das geschafft hast.\"\n\nKomplimente,\ndie verletzen.", "light"),
    ("Zeichen #4", "Falsche\nBescheidenheit", "„Ach, ich bin\nnichts Besonderes.\"\n\n— wartet darauf,\ndass du widersprichst.\nWieder und wieder.", "light"),
    ("Zeichen #5", "Empathie nur\nbeim Reden", "Klingt mitfühlend.\nFühlt sich kalt an.\n\nWorte sind warm.\nHandlungen sind leer.", "light"),
    ("Zeichen #6", "Du fühlst\ndich verrückt", "Nach Gesprächen\nzweifelst du an dir.\n\nDu bist müde,\nverwirrt, schuldig —\nohne genau zu wissen\nwarum.", "light"),
    ("Wichtig", "Wenn du das\nerkennst", "Dann ist da\nnichts mit dir falsch.\n\nDu spürst nur die\nManipulation, die\nandere nicht sehen.", "pink"),
    ("ende", "Mehr lesen?", "herzblatt-journal.com\nVoller Guide ♥", "dark"),
]
for i, (k, t, b, theme) in enumerate(slides_5, 1):
    slide(f"{P5}_slide{i}.jpg", k if k not in ("hook","ende") else "", t, b, i, len(slides_5), theme)

print("DONE")
