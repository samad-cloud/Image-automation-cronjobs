import '../config';
import { MultiUserJiraFetchJob } from './MultiUserJiraFetchJob';

console.log('[MULTI-USER-JIRA-FETCH] Starting Multi-User Jira Fetch Job...');
console.log('[MULTI-USER-JIRA-FETCH] Environment check:', {
  SUPABASE_URL: process.env.SUPABASE_URL ? 'SET' : 'NOT SET',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'NOT SET'
});

const job = new MultiUserJiraFetchJob();
console.log('[MULTI-USER-JIRA-FETCH] Job instance created, starting execution...');

job.execute().catch((error) => {
  console.error('[MULTI-USER-JIRA-FETCH] Fatal error in job execution:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('[MULTI-USER-JIRA-FETCH] Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('[MULTI-USER-JIRA-FETCH] Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});
