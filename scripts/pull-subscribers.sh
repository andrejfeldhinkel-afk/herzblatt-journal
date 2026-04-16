#!/usr/bin/env bash
# Holt die aktuelle subscribers.csv vom Live-Server und schreibt sie nach data/subscribers.csv
#
# Voraussetzung: HERZBLATT_ADMIN_TOKEN als ENV-Variable (in ~/.zshrc oder .env)
#
# Benutzung:
#   ./scripts/pull-subscribers.sh
#   ./scripts/pull-subscribers.sh --merge   # mergt mit lokaler CSV (dedupliziert nach email)
#   ./scripts/pull-subscribers.sh --backup  # macht vorher Backup der lokalen Datei

set -euo pipefail

SITE_URL="${HERZBLATT_SITE_URL:-https://herzblatt-journal.com}"
TARGET_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/data"
TARGET_FILE="$TARGET_DIR/subscribers.csv"
TMP_FILE="$TARGET_DIR/.subscribers.tmp.csv"

# --- Token prüfen ---
if [ -z "${HERZBLATT_ADMIN_TOKEN:-}" ]; then
  echo "❌ Fehler: HERZBLATT_ADMIN_TOKEN ist nicht gesetzt."
  echo ""
  echo "Setze den Token so in deiner Shell:"
  echo '  export HERZBLATT_ADMIN_TOKEN="dein-token"'
  echo ""
  echo "Den Token findest du in Railway → Variables → ADMIN_TOKEN."
  exit 1
fi

mkdir -p "$TARGET_DIR"

# --- Flags ---
MODE="replace"  # replace | merge
MAKE_BACKUP=false
for arg in "$@"; do
  case "$arg" in
    --merge) MODE="merge" ;;
    --backup) MAKE_BACKUP=true ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# //; s/^#//' | head -20
      exit 0
      ;;
  esac
done

# --- Backup ---
if [ "$MAKE_BACKUP" = true ] && [ -f "$TARGET_FILE" ]; then
  STAMP=$(date +%Y%m%d-%H%M%S)
  cp "$TARGET_FILE" "$TARGET_DIR/subscribers.backup.$STAMP.csv"
  echo "📦 Backup: data/subscribers.backup.$STAMP.csv"
fi

# --- Download ---
echo "📥 Lade CSV von $SITE_URL..."
HTTP_CODE=$(curl -sS -w "%{http_code}" \
  -H "Authorization: Bearer $HERZBLATT_ADMIN_TOKEN" \
  -o "$TMP_FILE" \
  "$SITE_URL/api/admin/subscribers.csv") || {
    echo "❌ Fehler beim Download. Netzwerk?"
    rm -f "$TMP_FILE"
    exit 1
  }

case "$HTTP_CODE" in
  200)
    ;;
  401)
    echo "❌ 401 Unauthorized — der Token ist falsch."
    rm -f "$TMP_FILE"
    exit 1
    ;;
  503)
    echo "❌ 503 — ADMIN_TOKEN ist auf dem Server nicht gesetzt."
    echo "   Geh zu Railway → Variables und setze ADMIN_TOKEN (mindestens 20 Zeichen)."
    rm -f "$TMP_FILE"
    exit 1
    ;;
  *)
    echo "❌ Unerwarteter HTTP-Code: $HTTP_CODE"
    cat "$TMP_FILE"
    rm -f "$TMP_FILE"
    exit 1
    ;;
esac

SERVER_LINES=$(wc -l < "$TMP_FILE" | tr -d ' ')
SERVER_ROWS=$((SERVER_LINES > 0 ? SERVER_LINES - 1 : 0))

# --- Write-Modus ---
if [ "$MODE" = "replace" ] || [ ! -f "$TARGET_FILE" ]; then
  mv "$TMP_FILE" "$TARGET_FILE"
  echo "✅ $SERVER_ROWS Einträge nach $TARGET_FILE geschrieben (replace)."
else
  # merge: beide CSVs zusammenführen, dedupliziert nach email (2. Spalte)
  LOCAL_ROWS=$(($(wc -l < "$TARGET_FILE" | tr -d ' ') - 1))
  MERGED_TMP="$TARGET_DIR/.subscribers.merged.csv"

  # Header aus einer der Dateien
  head -1 "$TARGET_FILE" > "$MERGED_TMP"

  # Alle Datenzeilen aus beiden Dateien, dedupliziert nach Spalte 2 (email, lowercase)
  (tail -n +2 "$TARGET_FILE"; tail -n +2 "$TMP_FILE") \
    | awk -F',' '
      BEGIN { OFS="," }
      {
        # email = Spalte 2, ggf. entquoten, lowercase
        em = tolower($2)
        gsub(/"/, "", em)
        if (!(em in seen) && em != "") {
          seen[em] = 1
          print
        }
      }
    ' >> "$MERGED_TMP"

  mv "$MERGED_TMP" "$TARGET_FILE"
  rm -f "$TMP_FILE"
  MERGED_ROWS=$(($(wc -l < "$TARGET_FILE" | tr -d ' ') - 1))
  echo "✅ Merge abgeschlossen: lokal $LOCAL_ROWS + server $SERVER_ROWS → $MERGED_ROWS (dedupliziert)"
fi

echo ""
echo "📄 CSV: $TARGET_FILE"
head -3 "$TARGET_FILE" 2>/dev/null | sed 's/^/   /'
