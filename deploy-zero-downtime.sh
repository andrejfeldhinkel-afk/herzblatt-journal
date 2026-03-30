#!/bin/bash
# =============================================================
# Zero-Downtime Deploy für herzblatt-journal.com
# =============================================================
# Baut in ein Staging-Verzeichnis, tauscht dann atomar,
# und startet den Server via pm2 neu.
# =============================================================

set -e

BLOG_DIR="/home/xy/Andrej/blog"
DIST_DIR="$BLOG_DIR/dist"
DIST_STAGING="$BLOG_DIR/dist-staging"
DIST_OLD="$BLOG_DIR/dist-old"
PM2="PM2_HOME=/home/xy/.pm2 pm2"

echo "=========================================="
echo "  Zero-Downtime Deploy"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="

# 1. Aufräumen von eventuellen alten Staging-Ordnern
echo ""
echo "[1/6] Aufräumen..."
rm -rf "$DIST_STAGING" "$DIST_OLD"
echo "  ✅ Alte Staging-Ordner entfernt"

# 2. Build in Staging-Verzeichnis (alte dist/ bleibt unberührt!)
echo ""
echo "[2/6] Baue in Staging-Verzeichnis (Website bleibt online)..."
cd "$BLOG_DIR"
HOME=/tmp ASTRO_TELEMETRY_DISABLED=1 npx astro build --outDir dist-staging 2>&1 | tail -5

if [ ! -d "$DIST_STAGING" ] || [ ! -d "$DIST_STAGING/client" ]; then
    echo "  ❌ Build fehlgeschlagen! Website bleibt unverändert."
    rm -rf "$DIST_STAGING"
    exit 1
fi
echo "  ✅ Build erfolgreich in dist-staging/"

# 3. Atomar tauschen: dist → dist-old, dist-staging → dist
echo ""
echo "[3/6] Tausche Verzeichnisse (atomar)..."
mv "$DIST_DIR" "$DIST_OLD"
mv "$DIST_STAGING" "$DIST_DIR"
echo "  ✅ dist-staging → dist (alte Version in dist-old)"

# 4. Bild-Berechtigungen fixen
echo ""
echo "[4/6] Fixe Bild-Berechtigungen..."
chmod 644 "$DIST_DIR/client/images/photos/"*.webp 2>/dev/null || true
echo "  ✅ Bilder auf 644 gesetzt"

# 5. Server via pm2 neustarten
echo ""
echo "[5/6] Starte Server neu via pm2..."

# Stop old processes
eval $PM2 stop blog 2>/dev/null || true
eval $PM2 delete blog 2>/dev/null || true
eval $PM2 stop herzblatt-blog 2>/dev/null || true
eval $PM2 delete herzblatt-blog 2>/dev/null || true

# Kill any leftover node processes on port 9991
fuser -k 9991/tcp 2>/dev/null || true
sleep 1

# Start with server.mjs (contains redirects)
cd "$BLOG_DIR"
eval $PM2 start server.mjs --name blog
sleep 3

# Prüfe ob Server läuft
STATUS=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:9991/)
if [ "$STATUS" = "200" ]; then
    echo "  ✅ Server läuft (HTTP $STATUS)"
    eval $PM2 save
else
    echo "  ⚠️  Server antwortet mit HTTP $STATUS — Rollback..."
    eval $PM2 stop blog 2>/dev/null || true
    eval $PM2 delete blog 2>/dev/null || true
    fuser -k 9991/tcp 2>/dev/null || true
    rm -rf "$DIST_DIR"
    mv "$DIST_OLD" "$DIST_DIR"
    cd "$BLOG_DIR"
    eval $PM2 start dist/server/entry.mjs --name blog
    eval $PM2 save
    echo "  ✅ Rollback abgeschlossen — alte Version wiederhergestellt"
    exit 1
fi

# 6. Aufräumen
echo ""
echo "[6/6] Aufräumen..."
rm -rf "$DIST_OLD"
echo "  ✅ Alte Version entfernt"

# Statistiken
ARTICLES=$(ls "$BLOG_DIR/src/content/blog/" | wc -l)
echo ""
echo "=========================================="
echo "  ✅ Deploy erfolgreich!"
echo "  📊 $ARTICLES Artikel online"
echo "  🌐 https://herzblatt-journal.com"
echo "  ⏱  Downtime: ~3 Sekunden (nur Server-Restart)"
echo "=========================================="
