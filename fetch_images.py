import requests, os, subprocess, time

API_KEY = "j44gZEdWSlOdl7o3OddIabLuYGjbA7w2EOIeqFY21AcCF4vyLJFR1L0Q"
IMG_DIR = "public/images/blog"

articles = {
    "dating-mit-depression": "person sad thinking alone window",
    "erster-kuss-tipps-ratgeber": "couple first kiss romantic",
    "partner-finden-mit-30": "confident woman 30s city dating",
    "beziehung-nach-fremdgehen-aufarbeiten": "couple serious conversation couch",
    "dating-angst-soziale-phobie": "shy person anxiety cafe alone",
    "dating-nach-toxischer-familie": "healing woman nature freedom",
    "perfektes-online-dating-profil-erstellen": "smartphone dating app profile photo",
    "beziehung-verschiedene-lebensziele": "couple crossroads decision path",
    "dating-apps-algorithmus-verstehen": "phone dating app swipe technology",
    "emotionale-intelligenz-beziehung": "couple empathy emotional connection",
    "dating-fuer-maenner-komplettguide": "confident man style dating",
    "beziehung-nach-kindsverlust": "couple comfort grief holding hands",
    "online-dating-scams-erkennen": "online security warning phone scam",
    "kreative-date-ideen-jede-jahreszeit": "couple fun outdoor adventure date",
    "beziehung-introvertiert-extrovertiert": "introvert extrovert couple balance",
    "dating-fuer-frauen-selbstbewusst": "confident woman empowered dating",
    "beziehung-unterschiedliche-sprachen": "multicultural couple love language",
    "dating-nach-gewalt-in-beziehung": "woman strength healing recovery",
    "beziehung-und-geld-komplett": "couple finance money planning together",
    "dating-als-elternteil-guide": "single parent child dating balance",
    "beziehung-nach-burnout": "exhausted couple recovery rest healing",
    "dating-mit-behinderung-guide": "inclusive dating wheelchair couple love",
    "attachment-styles-heilen-guide": "psychology healing attachment therapy",
    "beziehung-streit-richtig-vertragen": "couple making up after argument",
    "dating-ueber-50-neustart": "mature couple happy dating 50s",
    "beziehung-rituale-fuer-paare": "couple morning ritual coffee together",
    "dating-mit-autismus-guide": "neurodivergent person calm nature",
    "beziehung-konfliktfrei-kommunizieren": "couple peaceful communication talking",
    "dating-verschiedene-altersgruppen": "age gap couple happy together",
    "selbstliebe-vor-beziehung-masterclass": "self love mirror confidence woman",
}

success = 0
for slug, query in articles.items():
    img_path = os.path.join(IMG_DIR, f"{slug}.webp")
    if os.path.exists(img_path):
        print(f"SKIP {slug} (exists)")
        success += 1
        continue
    try:
        headers = {"Authorization": API_KEY}
        resp = requests.get(f"https://api.pexels.com/v1/search?query={query}&per_page=1&orientation=landscape", headers=headers)
        data = resp.json()
        if "photos" in data and len(data["photos"]) > 0:
            img_url = data["photos"][0]["src"]["large"]
            img_resp = requests.get(img_url)
            tmp_path = f"/tmp/{slug}_tmp.jpg"
            with open(tmp_path, "wb") as f:
                f.write(img_resp.content)
            subprocess.run(["npx", "sharp-cli", "-i", tmp_path, "-o", img_path, "--width", "800", "--height", "400", "--fit", "cover", "--format", "webp"], capture_output=True, timeout=30)
            if not os.path.exists(img_path):
                subprocess.run(["convert", tmp_path, "-resize", "800x400^", "-gravity", "center", "-extent", "800x400", "-quality", "80", img_path], capture_output=True, timeout=30)
            if os.path.exists(img_path):
                print(f"OK {slug}")
                success += 1
            else:
                print(f"FAIL convert {slug}")
            os.remove(tmp_path)
        else:
            print(f"FAIL no photos for {slug}")
        time.sleep(0.3)
    except Exception as e:
        print(f"ERROR {slug}: {e}")

print(f"\n=== {success}/{len(articles)} images done ===")
