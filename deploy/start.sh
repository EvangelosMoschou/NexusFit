#!/usr/bin/env bash
# ==============================================================================
# NexusFit Fast Server Startup Script
# ==============================================================================

set -e

echo "🚀 Starting NexusFit Production Setup..."

# 1. Install dependencies
echo "📦 Installing clean dependencies..."
npm ci --prefer-offline

# 2. Build Next.js 15 Application
echo "⚙️ Building production bundle..."
npm run build

# 3. Create persistent SQLite data directory if not exists
mkdir -p data

# 4. Start production server
echo "✅ Server ready! Starting on port 3000..."
npm run start
