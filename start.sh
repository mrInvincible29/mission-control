#!/bin/bash
# Mission Control startup script

cd "$(dirname "$0")"

# Check if Convex is configured
if [ -z "$(grep NEXT_PUBLIC_CONVEX_URL .env.local 2>/dev/null | grep -v '^#' | grep -v '=$')" ]; then
    echo "⚠️  Convex not configured!"
    echo "Run: npx convex dev"
    echo "Then add NEXT_PUBLIC_CONVEX_URL to .env.local"
    echo ""
    echo "Starting anyway (will show setup guide)..."
fi

# Production mode
if [ "$1" = "prod" ]; then
    echo "🚀 Starting Mission Control (production)..."
    npm run start
else
    echo "🔧 Starting Mission Control (development)..."
    npm run dev
fi
