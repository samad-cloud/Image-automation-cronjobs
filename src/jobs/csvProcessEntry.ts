#!/usr/bin/env node

import { CSVProcessJob } from './CSVProcessJob'

async function main() {
  console.log('[CSV-PROCESS-ENTRY] Starting CSV processing job entry...');
  
  // Get configuration from environment variables
  const userId = process.env.CSV_USER_ID || undefined;
  const batchId = process.env.CSV_BATCH_ID || undefined;
  const maxConcurrentJobs = parseInt(process.env.CSV_MAX_CONCURRENT_JOBS || '3');
  const instanceId = process.env.INSTANCE_ID || `csv-process-${Math.random().toString(36).substring(7)}`;

  console.log('[CSV-PROCESS-ENTRY] Configuration:');
  console.log(`  User ID: ${userId || 'ALL'}`);
  console.log(`  Batch ID: ${batchId || 'ALL'}`);
  console.log(`  Max Concurrent Jobs: ${maxConcurrentJobs}`);
  console.log(`  Instance ID: ${instanceId}`);

  // Create and start the CSV processing job
  const job = new CSVProcessJob(userId, batchId, maxConcurrentJobs);
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('[CSV-PROCESS-ENTRY] Received SIGINT, shutting down gracefully...');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('[CSV-PROCESS-ENTRY] Received SIGTERM, shutting down gracefully...');
    process.exit(0);
  });

  try {
    await job.execute();
  } catch (error) {
    console.error('[CSV-PROCESS-ENTRY] Fatal error in CSV processing job:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[CSV-PROCESS-ENTRY] Unhandled error:', error);
    process.exit(1);
  });
}

export { main }
