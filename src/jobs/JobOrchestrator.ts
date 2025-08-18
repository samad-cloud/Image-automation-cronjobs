import { BaseJob } from './BaseJob'
import { MultiUserJiraFetchJob } from './MultiUserJiraFetchJob'
import { MultiUserEventProcessJob } from './MultiUserEventProcessJob'
import { CSVProcessJob } from './CSVProcessJob'
import { UserCredentials, JobInstance } from '../../supabase/types'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

interface ActiveJob {
  job: BaseJob
  userId?: string
  jobType: 'jira-fetch' | 'event-process' | 'csv-process'
  instanceId: string
  startTime: Date
}

export class JobOrchestrator {
  private supabase: SupabaseClient
  private activeJobs: Map<string, ActiveJob> = new Map()
  private orchestratorInstanceId: string
  private isRunning = false

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          persistSession: false
        }
      }
    )
    this.orchestratorInstanceId = `orchestrator-${Math.random().toString(36).substring(7)}`
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[ORCHESTRATOR] Already running, skipping start');
      return;
    }

    this.isRunning = true;
    console.log(`[ORCHESTRATOR] Starting Job Orchestrator with instance ID: ${this.orchestratorInstanceId}`);

    try {
      // Initial setup
      await this.initializeJobs()
      
      // Start monitoring loop
      this.startMonitoringLoop()
      
      console.log('[ORCHESTRATOR] Job Orchestrator started successfully');
    } catch (error) {
      console.error('[ORCHESTRATOR] Error starting Job Orchestrator:', error);
      this.isRunning = false;
      throw error;
    }
  }

  async stop(): Promise<void> {
    console.log('[ORCHESTRATOR] Stopping Job Orchestrator...');
    this.isRunning = false;

    // Stop all active jobs
    for (const [jobKey, activeJob] of this.activeJobs) {
      console.log(`[ORCHESTRATOR] Stopping job: ${jobKey}`);
      try {
        // Update job status to stopped
        await this.supabase
          .rpc('update_job_instance_activity', {
            p_instance_id: activeJob.instanceId,
            p_status: 'stopped'
          })
      } catch (error) {
        console.error(`[ORCHESTRATOR] Error stopping job ${jobKey}:`, error);
      }
    }

    this.activeJobs.clear();
    console.log('[ORCHESTRATOR] Job Orchestrator stopped');
  }

  private async initializeJobs(): Promise<void> {
    console.log('[ORCHESTRATOR] Initializing jobs for all users...');

    // Start global multi-user jobs (these process all users)
    await this.startGlobalJobs()

    // Get users with Jira integrations and optionally start user-specific jobs
    const users = await this.getActiveUsers()
    console.log(`[ORCHESTRATOR] Found ${users.length} users with active integrations`);

    // For now, we'll use global jobs, but this is where you could start user-specific jobs
    // if you need better isolation or scaling per user
    for (const user of users) {
      console.log(`[ORCHESTRATOR] User ${user.user_id} has active Jira integration`);
    }
  }

  private async startGlobalJobs(): Promise<void> {
    console.log('[ORCHESTRATOR] Starting global multi-user jobs...');

    // Start global Jira fetch job (processes all users)
    await this.startJob('global-jira-fetch', 'jira-fetch', undefined)

    // Start global event process jobs (2 instances for parallel processing)
    await this.startJob('global-event-process-1', 'event-process', undefined)
    await this.startJob('global-event-process-2', 'event-process', undefined)
    
    // Start CSV processing jobs
    await this.startCSVJobs()
  }

  private async startCSVJobs(): Promise<void> {
    console.log('[ORCHESTRATOR] Starting CSV processing jobs...');

    try {
      // Start a global CSV processing job that handles all users and batches
      await this.startJob('global-csv-process', 'csv-process', undefined, undefined)

      // Get active CSV batches that need processing
      const activeBatches = await this.getActiveCsvBatches()
      
      console.log(`[ORCHESTRATOR] Found ${activeBatches.length} active CSV batches`);

      // Start dedicated workers for high-priority or large batches
      for (const batch of activeBatches) {
        // Only start dedicated workers for batches with many rows or specific requirements
        if (batch.total_rows > 20) {
          const jobKey = `csv-batch-${batch.id}`
          await this.startJob(jobKey, 'csv-process', batch.user_id, batch.id)
        }
      }
    } catch (error) {
      console.error('[ORCHESTRATOR] Error starting CSV jobs:', error);
    }
  }

  private async getActiveCsvBatches(): Promise<any[]> {
    try {
      const { data, error } = await this.supabase
        .from('csv_batches')
        .select('id, user_id, total_rows, status')
        .in('status', ['queued', 'processing'])
        .order('created_at', { ascending: true })
        .limit(10) // Limit to prevent too many dedicated workers

      if (error) {
        console.error('[ORCHESTRATOR] Error fetching active CSV batches:', error);
        return []
      }

      return data || []
    } catch (error) {
      console.error('[ORCHESTRATOR] Error in getActiveCsvBatches:', error);
      return []
    }
  }

  private async startJob(jobKey: string, jobType: 'jira-fetch' | 'event-process' | 'csv-process', userId?: string, batchId?: string): Promise<void> {
    if (this.activeJobs.has(jobKey)) {
      console.log(`[ORCHESTRATOR] Job ${jobKey} is already running`);
      return;
    }

    console.log(`[ORCHESTRATOR] Starting ${jobType} job: ${jobKey}${userId ? ` for user: ${userId}` : ' (global)'}`);

    try {
      let job: BaseJob;
      
      switch (jobType) {
        case 'jira-fetch':
          job = new MultiUserJiraFetchJob(userId);
          break;
        case 'event-process':
          job = new MultiUserEventProcessJob(userId);
          break;
        case 'csv-process':
          job = new CSVProcessJob(userId, batchId);
          break;
        default:
          throw new Error(`Unknown job type: ${jobType}`);
      }

      // Store the active job
      const activeJob: ActiveJob = {
        job,
        userId,
        jobType,
        instanceId: (job as any).instanceId, // Access protected instanceId
        startTime: new Date()
      }

      this.activeJobs.set(jobKey, activeJob);

      // Start the job execution (non-blocking)
      job.execute().catch(async (error) => {
        console.error(`[ORCHESTRATOR] Job ${jobKey} failed:`, error);
        
        // Remove from active jobs
        this.activeJobs.delete(jobKey);
        
        // Update job status
        await this.supabase
          .rpc('update_job_instance_activity', {
            p_instance_id: activeJob.instanceId,
            p_status: 'error',
            p_error_message: error instanceof Error ? error.message : 'Unknown error'
          })

        // Restart after delay if orchestrator is still running
        if (this.isRunning) {
          console.log(`[ORCHESTRATOR] Restarting job ${jobKey} in 30 seconds...`);
          setTimeout(() => {
            if (this.isRunning) {
              this.startJob(jobKey, jobType, userId);
            }
          }, 30000);
        }
      });

      console.log(`[ORCHESTRATOR] Successfully started job: ${jobKey}`);
    } catch (error) {
      console.error(`[ORCHESTRATOR] Error starting job ${jobKey}:`, error);
      throw error;
    }
  }

  private startMonitoringLoop(): void {
    console.log('[ORCHESTRATOR] Starting monitoring loop...');

    const monitorInterval = setInterval(async () => {
      if (!this.isRunning) {
        clearInterval(monitorInterval);
        return;
      }

      try {
        await this.monitorJobs()
        await this.handleUserChanges()
        await this.cleanupStaleJobs()
      } catch (error) {
        console.error('[ORCHESTRATOR] Error in monitoring loop:', error);
      }
    }, 5 * 60 * 1000); // Monitor every 5 minutes
  }

  private async monitorJobs(): Promise<void> {
    // Check if all expected jobs are running
    const expectedJobs = [
      'global-jira-fetch',
      'global-event-process-1',
      'global-event-process-2'
    ];

    for (const jobKey of expectedJobs) {
      if (!this.activeJobs.has(jobKey)) {
        console.log(`[ORCHESTRATOR] Job ${jobKey} is not running, restarting...`);
        
        const [, jobType, instance] = jobKey.split('-');
        const fullJobType = jobType === 'jira' ? 'jira-fetch' : 'event-process';
        
        await this.startJob(jobKey, fullJobType as any);
      }
    }
  }

  private async handleUserChanges(): Promise<void> {
    // Check for new users with Jira integrations
    // For now, global jobs handle all users, but this is where you'd
    // start user-specific jobs if needed

    const users = await this.getActiveUsers()
    console.log(`[ORCHESTRATOR] Monitoring ${users.length} active users`);
  }

  private async cleanupStaleJobs(): Promise<void> {
    try {
      const { data: cleaned } = await this.supabase
        .rpc('cleanup_stale_job_instances', {
          p_timeout_minutes: 30
        }) as { data: number | null }

      if (cleaned && cleaned > 0) {
        console.log(`[ORCHESTRATOR] Cleaned up ${cleaned} stale job instances`);
      }
    } catch (error) {
      console.error('[ORCHESTRATOR] Error cleaning up stale jobs:', error);
    }
  }

  private async getActiveUsers(): Promise<UserCredentials[]> {
    try {
      const { data: users, error } = await this.supabase
        .rpc('get_active_jira_users') as { data: any[] | null, error: any }

      if (error) {
        console.error('[ORCHESTRATOR] Error fetching active users:', error);
        return [];
      }

      return users?.map((user: any) => ({
        user_id: user.user_id,
        jira_config: user.jira_config as any,
        last_synced: user.last_synced
      })) || [];
    } catch (error) {
      console.error('[ORCHESTRATOR] Error getting active users:', error);
      return [];
    }
  }

  // Public methods for external control

  async restartUserJobs(userId: string): Promise<void> {
    console.log(`[ORCHESTRATOR] Restarting jobs for user: ${userId}`);
    
    // For global jobs, no action needed since they process all users
    // If you had user-specific jobs, you'd restart them here
    
    console.log(`[ORCHESTRATOR] User ${userId} jobs are handled by global jobs`);
  }

  async handleUserIntegrationChange(userId: string, action: 'created' | 'updated' | 'deleted'): Promise<void> {
    console.log(`[ORCHESTRATOR] Handling user integration change: ${action} for user: ${userId}`);
    
    switch (action) {
      case 'created':
      case 'updated':
        // Global jobs will pick up the new/updated integration automatically
        console.log(`[ORCHESTRATOR] Integration ${action} for user ${userId} - global jobs will handle`);
        break;
        
      case 'deleted':
        // Clean up any user-specific data or jobs if needed
        console.log(`[ORCHESTRATOR] Integration deleted for user ${userId} - cleaning up if needed`);
        break;
    }
  }

  getJobStatus(): { jobKey: string; status: string; userId?: string; uptime: number }[] {
    const status = [];
    
    for (const [jobKey, activeJob] of this.activeJobs) {
      status.push({
        jobKey,
        status: 'running',
        userId: activeJob.userId,
        uptime: Date.now() - activeJob.startTime.getTime()
      });
    }
    
    return status;
  }
}
