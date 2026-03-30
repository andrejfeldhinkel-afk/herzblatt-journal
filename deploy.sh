#!/bin/bash
# Deploy Herzblatt Journal to server
set -e

SERVER="andrej@31.17.240.14"
SSH_KEY="$HOME/.ssh/DerEineDa1312"
REMOTE_PATH="/home/xy/Andrej/blog"
LOCAL_PATH="$(dirname "$0")/blog"

echo "==> Syncing source files to server..."
rsync -avz \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude '.astro' \
  --exclude '.DS_Store' \
  --exclude 'images' \
  --exclude '.restart' \
  --exclude 'test_write.txt' \
  -e "ssh -i $SSH_KEY" \
  "$LOCAL_PATH/" "$SERVER:$REMOTE_PATH/"

echo "==> Installing dependencies & building..."
ssh -i "$SSH_KEY" "$SERVER" "cd $REMOTE_PATH && npm install && HOME=/tmp ASTRO_TELEMETRY_DISABLED=1 npm run build"

echo "==> Fixing permissions..."
ssh -i "$SSH_KEY" "$SERVER" "chmod -R a+rX $REMOTE_PATH/"

echo "==> Restarting herzblatt-blog..."
ssh -i "$SSH_KEY" "$SERVER" "curl -s -X POST http://localhost:1111/api/service/restart -H 'Content-Type: application/json' -d '{\"name\":\"herzblatt-blog\"}'"

echo ""
echo "==> Deploy complete!"
