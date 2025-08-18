import '../config';
import { JobOrchestrator } from './JobOrchestrator';

console.log('[ORCHESTRATOR] Starting Job Orchestrator...');
console.log('[ORCHESTRATOR] Environment check:', {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ? 'SET' : 'NOT SET',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY ? 'SET' : 'NOT SET',
  SUPABASE_URL: process.env.SUPABASE_URL ? 'SET' : 'NOT SET',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'NOT SET'
});

const orchestrator = new JobOrchestrator();

// Start the orchestrator
orchestrator.start().catch((error) => {
  console.error('[ORCHESTRATOR] Fatal error starting orchestrator:', error);
  process.exit(1);
});

// Status reporting
setInterval(() => {
  const status = orchestrator.getJobStatus();
  console.log('[ORCHESTRATOR] Job Status:', status.map(job => ({
    job: job.jobKey,
    uptime: `${Math.floor(job.uptime / 1000 / 60)}m`,
    user: job.userId || 'global'
  })));
}, 10 * 60 * 1000); // Report every 10 minutes

// Graceful shutdown
const shutdown = async () => {
  console.log('[ORCHESTRATOR] Received shutdown signal, stopping orchestrator...');
  try {
    await orchestrator.stop();
    console.log('[ORCHESTRATOR] Orchestrator stopped gracefully');
    process.exit(0);
  } catch (error) {
    console.error('[ORCHESTRATOR] Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
