import requests, os, time, io
from PIL import Image

API_KEY = "j44gZEdWSlOdl7o3OddIabLuYGjbA7w2EOIeqFY21AcCF4vyLJFR1L0Q"
IMG_DIR = "public/images/blog"

articles = {
    "erster-kuss-tipps-ratgeber": "couple first kiss romantic",
    "partner-finden-mit-30": "confident woman 30s city",
    "beziehung-nach-fremdgehen-aufarbeiten": "couple serious conversation",
    "dating-angst-soziale-phobie": "shy person cafe alone",
    "perfektes-online-dating-profil-erstellen": "smartphone dating app",
    "dating-fuer-maenner-komplettguide": "confident man style",
    "beziehung-nach-kindsverlust": "couple comfort grief",
    "online-dating-scams-erkennen": "phone security warning",
    "kreative-date-ideen-jede-jahreszeit": "couple fun adventure date",
    "beziehung-introvertiert-extrovertiert": "introvert extrovert couple",
    "dating-fuer-frauen-selbstbewusst": "confident woman dating",
    "dating-nach-gewalt-in-beziehung": "woman strength healing",
    "beziehung-und-geld-komplett": "couple finance planning",
    "dating-als-elternteil-guide": "parent child dating",
    "beziehung-nach-burnout": "couple recovery healing rest",
    "dating-mit-behinderung-guide": "inclusive love couple",
    "attachment-styles-heilen-guide": "psychology therapy healing",
    "beziehung-streit-richtig-vertragen": "couple making up hug",
    "dating-ueber-50-neustart": "mature couple happy",
    "beziehung-rituale-fuer-paare": "couple morning coffee ritual",
    "dating-mit-autismus-guide": "calm person nature peaceful",
    "beziehung-konfliktfrei-kommunizieren": "couple talking peaceful",
    "dating-verschiedene-altersgruppen": "age gap couple happy",
    "selbstliebe-vor-beziehung-masterclass": "self love confidence mirror",
}

success = 0
for slug, query in articles.items():
    img_path = os.path.join(IMG_DIR, f"{slug}.webp")
    if os.path.exists(img_path):
        print(f"SKIP {slug}")
        success += 1
        continue
    try:
        headers = {"Authorization": API_KEY}
        resp = requests.get(f"https://api.pexels.com/v1/search?query={query}&per_page=1&orientation=landscape", headers=headers)
        data = resp.json()
        if "photos" in data and data["photos"]:
            img_url = data["photos"][0]["src"]["large"]
            img_resp = requests.get(img_url)
            img = Image.open(io.BytesIO(img_resp.content))
            # Resize to 800x400 cover
            target_w, target_h = 800, 400
            img_ratio = img.width / img.height
            target_ratio = target_w / target_h
            if img_ratio > target_ratio:
                new_h = target_h
                new_w = int(target_h * img_ratio)
            else:
                new_w = target_w
                new_h = int(target_w / img_ratio)
            img = img.resize((new_w, new_h), Image.LANCZOS)
            left = (new_w - target_w) // 2
            top = (new_h - target_h) // 2
            img = img.crop((left, top, left + target_w, top + target_h))
            img.save(img_path, "WEBP", quality=80)
            print(f"OK {slug}")
            success += 1
        else:
            print(f"FAIL {slug}")
        time.sleep(0.3)
    except Exception as e:
        print(f"ERROR {slug}: {e}")

print(f"\n=== {success}/{len(articles)} images done ===")
