# Linux Deployment Guide

This guide will help you deploy the OpenAI Agents TS project on a Linux server.

## Prerequisites

- Linux server (Ubuntu 20.04+ recommended)
- Node.js 18+ installed
- Git installed
- Access to your Supabase project

## Quick Setup

1. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   cd openai-agents-ts
   ```

2. **Run the setup script:**
   ```bash
   npm run setup
   ```
   
   This will:
   - Check Node.js version
   - Install PM2 globally
   - Install project dependencies
   - Create a template .env file

3. **Configure environment variables:**
   ```bash
   nano .env
   ```
   
   Fill in your actual credentials:
   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   JIRA_URL=https://your-domain.atlassian.net
   JIRA_USERNAME=your_username
   JIRA_API=your_api_token
   OPENAI_API_KEY=your_openai_key
   GEMINI_API_KEY=your_gemini_key
   ```

4. **Set up the database:**
   - Go to your Supabase dashboard
   - Open the SQL editor
   - Run the migration: `supabase/migrations/20240315000000_test_tables.sql`

5. **Start the jobs:**
   ```bash
   npm run start:jobs
   ```
   
   Or manually:
   ```bash
   pm2 start ecosystem.config.js
   ```

## PM2 Management

### Check status:
```bash
pm2 status
```

### View logs:
```bash
pm2 logs
```

### Restart all jobs:
```bash
pm2 restart all
```

### Stop all jobs:
```bash
pm2 stop all
```

### Delete all jobs:
```bash
pm2 delete all
```

### Monitor resources:
```bash
pm2 monit
```

## Job Details

### Jira Fetch Job
- **Purpose**: Fetches Jira events and stores them in the database
- **Frequency**: Runs every hour
- **Instances**: 1

### Event Process Job
- **Purpose**: Processes pending events through the AI workflow and generates images
- **Frequency**: Checks every 5 minutes for new events
- **Instances**: 2 (for concurrent processing)

## Troubleshooting

### Check if jobs are running:
```bash
pm2 status
```

### View specific job logs:
```bash
pm2 logs jira-fetch
pm2 logs event-process
```

### Check for errors:
```bash
pm2 logs --err
```

### Restart a specific job:
```bash
pm2 restart jira-fetch
pm2 restart event-process
```

### If jobs keep crashing:
1. Check the logs: `pm2 logs`
2. Verify your .env file has all required variables
3. Ensure your Supabase database is accessible
4. Check that your API keys are valid

## File Structure

```
openai-agents-ts/
├── src/
│   ├── jobs/
│   │   ├── BaseJob.ts          # Base job class
│   │   ├── JiraFetchJob.ts     # Jira event fetcher
│   │   └── EventProcessJob.ts  # Event processor
│   ├── services/
│   │   ├── ImageGenerator.ts   # Gemini image generation
│   │   └── StorageService.ts   # Supabase storage
│   └── index.ts                # Main agent workflow
├── supabase/
│   └── migrations/             # Database migrations
├── ecosystem.config.js         # PM2 configuration
├── setup-linux.sh             # Linux setup script
└── .env                       # Environment variables (create this)
```

## Security Notes

- Keep your `.env` file secure and never commit it to version control
- Use the Supabase service role key only on the server
- Regularly rotate your API keys
- Monitor your API usage to avoid unexpected costs

## Performance Monitoring

The jobs include built-in monitoring:
- Job run tracking in `test_job_runs` table
- Error logging and retry mechanisms
- PM2 process monitoring

You can also set up external monitoring:
- PM2 Plus for advanced monitoring
- Custom health checks
- Alert notifications 