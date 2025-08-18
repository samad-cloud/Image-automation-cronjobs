#!/usr/bin/env node

import { CSVProcessJob } from './CSVProcessJob'

async function main() {
  console.log('[MULTI-CSV-PROCESS-ENTRY] Starting multi-user CSV processing job entry...');
  
  // Get configuration from environment variables
  const maxConcurrentJobs = parseInt(process.env.CSV_MAX_CONCURRENT_JOBS || '2');
  const instanceId = process.env.INSTANCE_ID || `multi-csv-process-${Math.random().toString(36).substring(7)}`;

  console.log('[MULTI-CSV-PROCESS-ENTRY] Configuration:');
  console.log(`  Mode: Multi-user (all users, all batches)`);
  console.log(`  Max Concurrent Jobs: ${maxConcurrentJobs}`);
  console.log(`  Instance ID: ${instanceId}`);

  // Create and start the CSV processing job for all users and batches
  const job = new CSVProcessJob(undefined, undefined, maxConcurrentJobs);
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('[MULTI-CSV-PROCESS-ENTRY] Received SIGINT, shutting down gracefully...');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('[MULTI-CSV-PROCESS-ENTRY] Received SIGTERM, shutting down gracefully...');
    process.exit(0);
  });

  try {
    await job.execute();
  } catch (error) {
    console.error('[MULTI-CSV-PROCESS-ENTRY] Fatal error in multi-user CSV processing job:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[MULTI-CSV-PROCESS-ENTRY] Unhandled error:', error);
    process.exit(1);
  });
}

export { main }
