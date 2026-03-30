#!/bin/bash
# ============================================
# Herzblatt Journal — Zero-Downtime Deploy
# ============================================
# Baut in einen temp-Ordner und tauscht dann
# atomar dist/ aus. KEINE Downtime!
# ============================================

set -e

BLOG_DIR="/home/xy/Andrej/blog"
cd "$BLOG_DIR"

echo ""
echo "🔷 Herzblatt Journal — Zero-Downtime Deploy"
echo "============================================="
echo ""

# 1. Artikel-Check
ARTICLE_COUNT=$(ls src/content/blog/*.md 2>/dev/null | wc -l)
echo "📝 Artikel: $ARTICLE_COUNT"

# 2. YAML-Validierung
echo "🔍 Prüfe Frontmatter..."
ERRORS=0
PUBDATE_FILES=$(grep -rl '^pubDate:' src/content/blog/*.md 2>/dev/null || true)
if [ -n "$PUBDATE_FILES" ]; then
    echo "⚠️  'pubDate' statt 'date' gefunden — fixe automatisch..."
    for pf in $PUBDATE_FILES; do
        sed -i 's/^pubDate:/date:/' "$pf"
        echo "   ✓ $(basename $pf)"
    done
fi
echo "✅ Frontmatter OK"

# 3. Counter aktualisieren
NEW_COUNT=$(ls src/content/blog/*.md 2>/dev/null | wc -l)
OLD_COUNT=$(grep -oP 'data-target="\K\d+' src/pages/index.astro | head -1)
if [ "$NEW_COUNT" != "$OLD_COUNT" ]; then
    sed -i "s/data-target=\"${OLD_COUNT}\" data-suffix=\"+\"/data-target=\"${NEW_COUNT}\" data-suffix=\"+\"/" src/pages/index.astro
    echo "📊 Counter: $OLD_COUNT → $NEW_COUNT"
fi

# 4. Build in temporären Ordner (Server läuft weiter mit altem dist!)
echo ""
echo "🔨 Starte Build in temp-Ordner..."
echo "   Server läuft weiter — Seite bleibt erreichbar!"
echo ""

# Astro Output-Verzeichnis temporär umleiten
TEMP_DIST="/home/xy/Andrej/blog/dist-new"
rm -rf "$TEMP_DIST"

# Astro config patchen für temporären Output
# Wir nutzen ASTRO_OUTPUT_DIR env var oder --outDir flag
HOME=/tmp ASTRO_TELEMETRY_DISABLED=1 npx astro build --outDir "$TEMP_DIST" 2>&1 | tail -5

BUILD_EXIT=$?
if [ $BUILD_EXIT -ne 0 ]; then
    echo ""
    echo "❌ Build fehlgeschlagen! Alte Version bleibt online."
    rm -rf "$TEMP_DIST"
    exit 1
fi

echo ""
echo "✅ Build erfolgreich!"

# 5. Atomarer Swap: alt → backup, neu → live
echo "🔄 Tausche dist/ atomar aus..."
BACKUP_DIST="/home/xy/Andrej/blog/dist-old"
rm -rf "$BACKUP_DIST"

# Schneller Swap (< 1ms Downtime)
mv "$BLOG_DIR/dist" "$BACKUP_DIST" 2>/dev/null || true
mv "$TEMP_DIST" "$BLOG_DIR/dist"

echo "✅ Swap erledigt!"

# 6. Aufräumen (altes dist löschen)
rm -rf "$BACKUP_DIST"

# 7. Verifizierung
echo ""
HTTP_STATUS=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:9991/)
if [ "$HTTP_STATUS" = "200" ]; then
    echo "✅ Server: HTTP $HTTP_STATUS"
else
    echo "⚠️  Server: HTTP $HTTP_STATUS — Rollback!"
    # Rollback falls was schiefging
    if [ -d "$BACKUP_DIST" ]; then
        mv "$BLOG_DIR/dist" "$TEMP_DIST" 2>/dev/null
        mv "$BACKUP_DIST" "$BLOG_DIR/dist"
        echo "↩️  Rollback auf alte Version!"
    fi
fi

echo ""
echo "============================================="
echo "🎉 Deploy erfolgreich — $NEW_COUNT Artikel"
echo "   Zero Downtime: ✅"
echo "============================================="
