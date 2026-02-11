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
  cp -r .next/static .next/standalone/.next/static
  [ -d public ] && cp -r public .next/standalone/public
fi

cd "$STANDALONE"
exec node server.js
