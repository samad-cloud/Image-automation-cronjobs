#!/bin/bash

# Linux setup script for OpenAI Agents TS project

echo "🚀 Setting up OpenAI Agents TS project on Linux..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    echo "   Visit: https://nodejs.org/"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js version: $(node -v)"

# Check if PM2 is installed globally
if ! command -v pm2 &> /dev/null; then
    echo "📦 Installing PM2 globally..."
    npm install -g pm2
fi

echo "✅ PM2 version: $(pm2 -v)"

# Install dependencies
echo "📦 Installing project dependencies..."
npm install

# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found. Creating template..."
    cat > .env << EOF
# Supabase Configuration
SUPABASE_URL=your_supabase_url_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here

# Jira Configuration
JIRA_URL=https://your-domain.atlassian.net
JIRA_USERNAME=your_jira_username
JIRA_API=your_jira_api_token

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here

# Gemini Configuration
GEMINI_API_KEY=your_gemini_api_key_here
EOF
    echo "📝 Please edit .env file with your actual credentials before starting the jobs."
else
    echo "✅ .env file found"
fi

# Create logs directory
mkdir -p logs

echo ""
echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env file with your actual credentials"
echo "2. Run the database migration: npm run migrate"
echo "3. Start the jobs: pm2 start ecosystem.config.js"
echo "4. Monitor logs: pm2 logs"
echo "5. Stop jobs: pm2 stop all"
echo ""
echo "📚 Useful PM2 commands:"
echo "  pm2 status          - Check job status"
echo "  pm2 logs            - View logs"
echo "  pm2 restart all     - Restart all jobs"
echo "  pm2 delete all      - Stop and delete all jobs"
echo "  pm2 monit           - Monitor CPU/Memory usage" 