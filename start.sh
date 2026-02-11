#!/bin/bash
# Mission Control startup script
# Always run from .next/standalone/ to serve static assets correctly
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
STANDALONE="$DIR/.next/standalone"

if [ ! -f "$STANDALONE/server.js" ]; then
  echo "No standalone build found. Building..."
  cd "$DIR"
  npm run build
fi

# Always sync static assets (build may have generated new chunks)
cp -r "$DIR/.next/static" "$STANDALONE/.next/static"
[ -d "$DIR/public" ] && cp -r "$DIR/public" "$STANDALONE/public"

cd "$STANDALONE"
exec node server.js
