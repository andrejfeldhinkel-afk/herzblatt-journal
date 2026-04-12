#!/usr/bin/env python3
import os, shutil, glob, re

BASE = "/sessions/clever-youthful-gates/mnt/Herzblatt Journal/tiktok"
DEST = os.path.join(BASE, "TikTok-Posts")

POSTS = [
    (6, "Love-Bombing-14-Tage", "6 Red Flags in den ersten 14 Tagen 🚩\nIgnorier die nicht. Dein zukünftiges Ich dankt dir.\nVoller Guide → herzblatt-journal.com",
     "#lovebombing #redflags #toxischebeziehung #narzissmus #dating #datingdeutschland #beziehung #healing #fyp #foryou #fürdich #selbstliebe #herzblattjournal #beziehungstipps #psychologie #manipulation #datingtipps #single #herzschmerz #frauenpower"),
    (7, "Bindungstypen-Test", "Welcher Bindungstyp bist du? 🧠\nDein Bindungsstil erklärt, warum deine Beziehungen so laufen wie sie laufen.\nTest im Blog → herzblatt-journal.com",
     "#bindungsstil #bindungstheorie #psychologie #beziehung #ängstlichgebunden #vermeidend #healing #fyp #foryou #fürdich #selbstliebe #beziehungstipps #dating #herzblattjournal #bindungstrauma #innereskind #selbstfindung #therapy #mentalhealth #liebe"),
    (8, "Erstes-Date-Fails", "5 Dinge die du am ersten Date NIE tun solltest 🙈\nSpeichern. Bevor du das nächste Date hast.\nMehr Tipps → herzblatt-journal.com",
     "#erstesdate #dating #datingtipps #datingdeutschland #flirten #beziehung #beziehungstipps #fyp #foryou #fürdich #single #liebe #kennenlernen #herzblattjournal #datingadvice #frauenpower #selbstbewusst #datingfails #datingcoach #romantik"),
    (9, "No-Contact-7-Tage", "No Contact Challenge: 7 Tage Plan 💪\nDer einzige Weg raus. Schritt für Schritt.\nKompletter Plan → herzblatt-journal.com",
     "#nocontact #trennung #liebeskummer #breakup #moveon #heilung #toxischebeziehung #fyp #foryou #fürdich #selbstliebe #loslassen #neuanfang #herzblattjournal #ex #exzurück #healing #psychologie #mentalhealth #stärke"),
    (10, "Selbstwert-Killer-Sätze", "5 Sätze die deinen Selbstwert killen ❌\nHör auf, sie zu sagen. Ab heute.\nMehr → herzblatt-journal.com",
     "#selbstwert #selbstliebe #affirmationen #mindset #mentalhealth #psychologie #innereskind #healing #fyp #foryou #fürdich #beziehung #selbstbewusstsein #frauenpower #herzblattjournal #selbstfindung #glücklichsein #mutmachen #therapy #positivität"),
    (11, "Green-Flags-Männer", "7 Green Flags die oft übersehen werden 💚\nDiese Männer sind Gold wert. Erkennst du sie?\nVoller Guide → herzblatt-journal.com",
     "#greenflags #dating #gesundebeziehung #beziehung #datingtipps #datingdeutschland #liebe #mrright #fyp #foryou #fürdich #beziehungstipps #herzblattjournal #männer #flirten #romantik #traummann #partnerschaft #single #healing"),
    (12, "Silent-Treatment", "Silent Treatment ist emotionaler Missbrauch 🚨\nJa, wirklich. Hier ist warum.\nMehr → herzblatt-journal.com",
     "#silenttreatment #toxischebeziehung #emotionalermissbrauch #narzissmus #manipulation #redflags #psychologie #fyp #foryou #fürdich #beziehung #healing #gaslighting #herzblattjournal #mentalhealth #selbstliebe #bindungstrauma #covert #beziehungsende #therapy"),
    (13, "Single-Sein-Gründe", "5 Gründe warum Single-Zeit ein Geschenk ist 🎁\nSingle ≠ einsam. Single = frei.\nMehr → herzblatt-journal.com",
     "#single #singlelife #selbstliebe #selbstfindung #freiheit #fyp #foryou #fürdich #healing #beziehungspause #nocontact #glücklichsein #frauenpower #herzblattjournal #mindset #positivität #selbstbewusstsein #mentalhealth #liebe #solo"),
    (14, "Flirt-Signale", "So zeigst du echtes Interesse 💕\n5 Signale die wirken. Ohne peinlich zu sein.\nFlirt-Guide → herzblatt-journal.com",
     "#flirten #dating #flirttipps #datingtipps #datingdeutschland #körpersprache #kennenlernen #fyp #foryou #fürdich #single #liebe #beziehung #herzblattjournal #romantik #erstesdate #flirtcoach #selbstbewusstsein #frauenpower #datingcoach"),
    (15, "Ex-Zurücknehmen-Check", "Ex zurücknehmen? 5 Fragen vorher 🤔\nEhrlich beantworten. Dein Herz wird es dir danken.\nMehr → herzblatt-journal.com",
     "#ex #exzurück #exfreund #trennung #breakup #beziehung #liebeskummer #fyp #foryou #fürdich #moveon #loslassen #nocontact #herzblattjournal #healing #reflexion #selbstliebe #mentalhealth #beziehungstipps #psychologie"),
    (16, "5-Minuten-Selfcare", "5-Minuten Self Care für schlechte Tage 🫶\nWenn alles zu viel ist. Save this.\nMehr Ideen → herzblatt-journal.com",
     "#selfcare #selbstliebe #mentalhealth #achtsamkeit #ruhe #stressabbau #fyp #foryou #fürdich #psychologie #healing #meditation #dankbarkeit #herzblattjournal #wohlbefinden #happyness #mindset #gesundheit #entspannung #positivität"),
    (17, "Grenzen-Sätze", "5 Grenzen-Sätze zum auswendig lernen 🛑\nSpeichern. Üben. Leben.\nGuide → herzblatt-journal.com",
     "#grenzensetzen #selbstliebe #neinsagen #selbstbewusstsein #psychologie #mentalhealth #healing #fyp #foryou #fürdich #beziehung #toxischebeziehung #herzblattjournal #boundaries #frauenpower #therapy #selbstfindung #manipulation #redflags #kommunikation"),
    (18, "3-Stufen-Heilung", "3 Stufen der emotionalen Heilung ✨\nBei welcher bist du gerade?\nGuide → herzblatt-journal.com",
     "#heilung #healing #emotionaleheilung #trauma #innereskind #psychologie #therapy #mentalhealth #fyp #foryou #fürdich #selbstliebe #loslassen #herzblattjournal #selbstfindung #bindungstrauma #spirituell #mindset #achtsamkeit #persönlichkeit"),
    (19, "Dating-App-Profil", "Dating App Profil fixen in 6 Schritten 📱\nDos & Don'ts. Matches kommen.\nGuide → herzblatt-journal.com",
     "#datingapp #tinder #bumble #hinge #datingprofil #dating #datingtipps #datingdeutschland #fyp #foryou #fürdich #single #kennenlernen #herzblattjournal #profiltipps #datingcoach #onlinedating #liebefinden #frauenpower #datingadvice"),
    (20, "5-Beziehungs-Fragen", "5 Fragen die jede Beziehung klärt 💬\nVor Monat 6 stellen. Rettet Herzen.\nMehr → herzblatt-journal.com",
     "#beziehung #beziehungstipps #kommunikation #liebe #partnerschaft #dating #fyp #foryou #fürdich #paartherapie #psychologie #herzblattjournal #gesundebeziehung #reflexion #selbstliebe #datingtipps #bindung #vertrauen #beziehungscoach #love"),
    (21, "Trauma-Bonding-Zeichen", "Trauma Bonding erkennen: 6 Zeichen 🔥\nDas ist keine Liebe. Das ist Sucht.\nMehr → herzblatt-journal.com",
     "#traumabonding #toxischebeziehung #narzissmus #bindungstrauma #healing #psychologie #mentalhealth #fyp #foryou #fürdich #manipulation #emotionalermissbrauch #herzblattjournal #codependency #redflags #selbstliebe #therapy #bindung #loslassen #heilung"),
    (22, "Inneres-Kind-Heilen", "Inneres Kind heilen: 5 Schritte 🧸\nHeilung beginnt bei deinem kleinen Ich.\nGuide → herzblatt-journal.com",
     "#innereskind #innerchild #heilung #healing #trauma #psychologie #therapy #mentalhealth #fyp #foryou #fürdich #selbstliebe #selbstfindung #herzblattjournal #achtsamkeit #spirituell #innerchildhealing #persönlichkeit #mindset #bindungstrauma"),
    (23, "Eifersucht-Ursachen", "Eifersucht verstehen: 4 Ursachen 💚\nEifersucht ist kein Liebesbeweis. Es ist Angst.\nMehr → herzblatt-journal.com",
     "#eifersucht #beziehung #vertrauen #liebe #psychologie #selbstwert #mentalhealth #fyp #foryou #fürdich #beziehungstipps #herzblattjournal #bindung #selbstliebe #paartherapie #healing #kommunikation #partnerschaft #datingtipps #emotionen"),
    (24, "Breadcrumbing", "Breadcrumbing erkennen 🍞\nEr hält dich hin. Mit Krümeln. Du verdienst mehr.\nMehr → herzblatt-journal.com",
     "#breadcrumbing #dating #datingtipps #toxischedating #redflags #datingdeutschland #manipulation #fyp #foryou #fürdich #single #liebe #herzblattjournal #beziehungstipps #selbstliebe #mentalhealth #datingfails #moderndating #ghosting #hinhalten"),
    (25, "7-Morgen-Rituale", "7 Morgen-Rituale für mehr Selbstliebe ☀️\nStart deinen Tag mit DIR.\nMehr → herzblatt-journal.com",
     "#morgenrituale #selfcare #selbstliebe #routine #morningroutine #mindset #dankbarkeit #fyp #foryou #fürdich #achtsamkeit #mentalhealth #positivität #herzblattjournal #glücklichsein #wohlbefinden #affirmationen #selbstfindung #healing #gesundheit"),
]

for num, name, caption, hashtags in POSTS:
    folder = os.path.join(DEST, f"Post{num}_{name}")
    os.makedirs(folder, exist_ok=True)
    files = sorted(glob.glob(os.path.join(BASE, f"post{num}_*.jpg")), key=lambda p: int(re.search(r"slide(\d+)", p).group(1)))
    for i, src in enumerate(files, start=1):
        dst = os.path.join(folder, f"slide_{i:02d}.jpg")
        shutil.copy(src, dst)
    cap = f"📌 POST {num}: {name.replace('-', ' ')}\n\nCAPTION:\n{caption}\n\nHASHTAGS:\n{hashtags}\n\nFORMAT: 1080×1350 px (TikTok Carousel)\nSlides: {len(files)}\n"
    with open(os.path.join(folder, "CAPTION.txt"), "w") as f:
        f.write(cap)
    print(f"Post {num}: {len(files)} slides")

print("DONE")
