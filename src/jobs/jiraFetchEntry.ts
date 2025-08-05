import '../config';
import { JiraFetchJob } from './JiraFetchJob';

console.log('[JIRA-FETCH] Starting Jira Fetch Job...');
console.log('[JIRA-FETCH] Environment check:', {
  JIRA_URL: process.env.JIRA_URL ? 'SET' : 'NOT SET',
  JIRA_USERNAME: process.env.JIRA_USERNAME ? 'SET' : 'NOT SET',
  JIRA_API: process.env.JIRA_API ? 'SET' : 'NOT SET',
  SUPABASE_URL: process.env.SUPABASE_URL ? 'SET' : 'NOT SET',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'NOT SET'
});

const job = new JiraFetchJob();
console.log('[JIRA-FETCH] Job instance created, starting execution...');
job.execute().catch((error) => {
  console.error('[JIRA-FETCH] Fatal error in job execution:', error);
  process.exit(1);
}); 