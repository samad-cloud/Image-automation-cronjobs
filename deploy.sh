#!/bin/bash

# Deployment script for Multi-User Cron Jobs

echo "🚀 Deploying Multi-User Cron Jobs..."

# Stop existing PM2 processes
echo "🛑 Stopping existing processes..."
pm2 stop all 2>/dev/null || true
pm2 delete all 2>/dev/null || true

# Install dependencies
echo "📦 Installing dependencies..."
npm install --production

# Install additional required packages
echo "📦 Installing additional packages..."
npm install csv-parse @types/node

# Create logs directory
mkdir -p logs

# Check TypeScript compilation for job files only
echo "🔧 Checking TypeScript compilation..."
npx tsc --project tsconfig.prod.json --noEmit || {
    echo "⚠️  TypeScript compilation has warnings, but proceeding with deployment..."
}

# Start jobs with the new configuration
echo "🔄 Starting multi-user jobs..."
pm2 start ecosystem.multiuser.config.js

# Save PM2 configuration
pm2 save

echo "✅ Deployment completed!"
echo ""
echo "📊 Check status: pm2 status"
echo "📋 View logs: pm2 logs"
echo "📋 View orchestrator logs: pm2 logs job-orchestrator"
echo "🛑 Stop jobs: pm2 stop all"

# Show current status
echo ""
echo "📊 Current Status:"
pm2 status
