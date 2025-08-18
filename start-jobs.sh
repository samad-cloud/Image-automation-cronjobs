#!/bin/bash

# Start script for OpenAI Agents TS jobs (Multi-User Edition)

echo "🚀 Starting OpenAI Agents TS Multi-User jobs..."

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

# Check which config to use
CONFIG_FILE="ecosystem.multiuser.config.js"
if [ "$1" = "--legacy" ]; then
    CONFIG_FILE="ecosystem.config.js"
    echo "🔄 Starting legacy single-user jobs with PM2..."
elif [ "$1" = "--backup" ]; then
    CONFIG_FILE="ecosystem.multiuser.config.js"
    echo "🔄 Starting multi-user jobs in backup mode..."
    # Start backup jobs manually
    pm2 start $CONFIG_FILE
    pm2 start multi-user-jira-fetch-backup
    pm2 start multi-user-event-process-backup
else
    echo "🔄 Starting multi-user jobs with orchestrator..."
fi

# Start jobs using PM2
pm2 start $CONFIG_FILE

echo "✅ Multi-User jobs started successfully!"
echo ""
echo "📊 Check status: pm2 status"
echo "📋 View logs: pm2 logs"
echo "📋 View orchestrator logs: pm2 logs job-orchestrator"
echo "🛑 Stop jobs: pm2 stop all"
echo ""
echo "💡 Usage:"
echo "  ./start-jobs.sh           # Start with orchestrator (recommended)"
echo "  ./start-jobs.sh --legacy  # Start legacy single-user jobs"
echo "  ./start-jobs.sh --backup  # Start with backup individual jobs" 