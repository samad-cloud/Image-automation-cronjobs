#!/bin/bash

# Start script for OpenAI Agents TS jobs

echo "🚀 Starting OpenAI Agents TS jobs..."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ .env file not found. Please create it with your credentials."
    exit 1
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Start jobs using PM2
echo "🔄 Starting jobs with PM2..."
pm2 start ecosystem.config.js

echo "✅ Jobs started successfully!"
echo ""
echo "📊 Check status: pm2 status"
echo "📋 View logs: pm2 logs"
echo "🛑 Stop jobs: pm2 stop all" 