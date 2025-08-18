import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { Database, UserCredentials, JobInstance } from '../../supabase/types'
import { Json } from '../../supabase/types'

export abstract class BaseJob {
  protected supabase: SupabaseClient<Database>
  protected instanceId: string
  protected jobName: string
  protected currentRunId?: string
  protected userId?: string
  protected userCredentials?: UserCredentials
  protected jobInstanceId?: string

  constructor(jobName: string, userId?: string) {
    this.supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!, // Use service role key for RLS bypass
      {
        auth: {
          persistSession: false
        }
      }
    )
    this.jobName = jobName
    this.userId = userId
    this.instanceId = userId 
      ? `${jobName}-${userId}-${Math.random().toString(36).substring(7)}`
      : `${jobName}-multi-${Math.random().toString(36).substring(7)}`
  }

  protected async setupUserContext(): Promise<void> {
    if (!this.userId) return

    console.log(`[${this.jobName.toUpperCase()}] Setting up user context for user: ${this.userId}`);
    
    try {
      // Get user's Jira credentials if this is a Jira-related job
      if (this.jobName.includes('jira')) {
        const { data: integration } = await this.supabase
          .from('external_integrations')
          .select('user_id, config, last_synced')
          .eq('user_id', this.userId)
          .eq('type', 'JIRA')
          .single()

        if (integration) {
          this.userCredentials = {
            user_id: integration.user_id,
            jira_config: integration.config as any,
            last_synced: integration.last_synced
          }
          console.log(`[${this.jobName.toUpperCase()}] Loaded Jira credentials for user: ${this.userId}`);
        }
      }

      // Register this job instance
      if (this.userId) {
        const { data: instanceId } = await this.supabase
          .rpc('register_job_instance', {
            p_user_id: this.userId,
            p_job_type: this.jobName as any,
            p_instance_id: this.instanceId
          })

        this.jobInstanceId = instanceId
        console.log(`[${this.jobName.toUpperCase()}] Registered job instance: ${this.instanceId}`);
      }
    } catch (error) {
      console.error(`[${this.jobName.toUpperCase()}] Error setting up user context:`, error);
      throw error;
    }
  }

  protected async updateJobActivity(status: 'running' | 'stopped' | 'error' = 'running', errorMessage?: string): Promise<void> {
    if (!this.jobInstanceId) return

    try {
      await this.supabase
        .rpc('update_job_instance_activity', {
          p_instance_id: this.instanceId,
          p_status: status,
          p_error_message: errorMessage || null
        })
    } catch (error) {
      console.error(`[${this.jobName.toUpperCase()}] Error updating job activity:`, error);
    }
  }

  protected async startRun(metadata?: Json) {
    console.log(`[${this.jobName.toUpperCase()}] Starting job run...`);
    
    // Setup user context first
    await this.setupUserContext()
    await this.updateJobActivity('running')
    
    try {
      const runMetadata = {
        user_id: this.userId,
        has_user_context: !!this.userCredentials,
        ...(metadata && typeof metadata === 'object' && metadata !== null ? metadata : {})
      }

      const { data, error } = await this.supabase
        .from('test_job_runs')
        .insert({
          job_name: this.jobName,
          instance_id: this.instanceId,
          metadata: runMetadata
        })
        .select()
        .single()

      if (error) {
        console.error(`[${this.jobName.toUpperCase()}] Error starting job run:`, error);
        throw error;
      }
      this.currentRunId = data.id;
      console.log(`[${this.jobName.toUpperCase()}] Job run started with ID: ${this.currentRunId}`);
    } catch (error) {
      console.error(`[${this.jobName.toUpperCase()}] Failed to start job run:`, error);
      await this.updateJobActivity('error', error instanceof Error ? error.message : 'Unknown error')
      throw error;
    }
  }

  protected async completeRun(error?: Error) {
    const status = error ? 'failed' : 'completed'
    
    // Update job instance activity
    await this.updateJobActivity(error ? 'error' : 'running', error?.message)
    
    if (!this.currentRunId) {
      console.log(`[${this.jobName.toUpperCase()}] No current run ID to complete`);
      return;
    }

    console.log(`[${this.jobName.toUpperCase()}] Completing job run ${this.currentRunId} with status: ${status}`);
    try {
      await this.supabase
        .from('test_job_runs')
        .update({
          status: status,
          completed_at: new Date().toISOString(),
          error: error?.message
        })
        .eq('id', this.currentRunId);

      console.log(`[${this.jobName.toUpperCase()}] Job run ${this.currentRunId} completed successfully`);
      this.currentRunId = undefined;
    } catch (completeError) {
      console.error(`[${this.jobName.toUpperCase()}] Error completing job run:`, completeError);
      throw completeError;
    }
  }

  abstract execute(): Promise<void>
}