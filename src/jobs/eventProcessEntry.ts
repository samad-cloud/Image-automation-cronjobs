import '../config';
import { EventProcessJob } from './EventProcessJob';

console.log('[EVENT-PROCESS] Starting Event Process Job...');
console.log('[EVENT-PROCESS] Environment check:', {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ? 'SET' : 'NOT SET',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY ? 'SET' : 'NOT SET',
  SUPABASE_URL: process.env.SUPABASE_URL ? 'SET' : 'NOT SET',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'NOT SET'
});

const job = new EventProcessJob();
console.log('[EVENT-PROCESS] Job instance created, starting execution...');
job.execute().catch((error) => {
  console.error('[EVENT-PROCESS] Fatal error in job execution:', error);
  process.exit(1);
}); 