import '../config';
import { MultiUserEventProcessJob } from './MultiUserEventProcessJob';

console.log('[MULTI-USER-EVENT-PROCESS] Starting Multi-User Event Process Job...');
console.log('[MULTI-USER-EVENT-PROCESS] Environment check:', {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ? 'SET' : 'NOT SET',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY ? 'SET' : 'NOT SET',
  SUPABASE_URL: process.env.SUPABASE_URL ? 'SET' : 'NOT SET',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'NOT SET'
});

const job = new MultiUserEventProcessJob();
console.log('[MULTI-USER-EVENT-PROCESS] Job instance created, starting execution...');

job.execute().catch((error) => {
  console.error('[MULTI-USER-EVENT-PROCESS] Fatal error in job execution:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('[MULTI-USER-EVENT-PROCESS] Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('[MULTI-USER-EVENT-PROCESS] Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});
