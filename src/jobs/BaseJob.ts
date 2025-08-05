import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { Database } from '../../supabase/types'
import { Json } from '../../supabase/types'

export abstract class BaseJob {
  protected supabase: SupabaseClient<Database>
  protected instanceId: string
  protected jobName: string
  protected currentRunId?: string

  constructor(jobName: string) {
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
    this.instanceId = `${jobName}-${Math.random().toString(36).substring(7)}`
  }

  protected async startRun(metadata?: Json) {
    console.log(`[${this.jobName.toUpperCase()}] Starting job run...`);
    try {
      const { data, error } = await this.supabase
        .from('test_job_runs')
        .insert({
          job_name: this.jobName,
          instance_id: this.instanceId,
          metadata
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
      throw error;
    }
  }

  protected async completeRun(error?: Error) {
    if (!this.currentRunId) {
      console.log(`[${this.jobName.toUpperCase()}] No current run ID to complete`);
      return;
    }

    console.log(`[${this.jobName.toUpperCase()}] Completing job run ${this.currentRunId} with status: ${error ? 'failed' : 'completed'}`);
    try {
      await this.supabase
        .from('test_job_runs')
        .update({
          status: error ? 'failed' : 'completed',
          completed_at: new Date().toISOString(),
          error: error?.message
        })
        .eq('id', this.currentRunId);

      console.log(`[${this.jobName.toUpperCase()}] Job run ${this.currentRunId} completed successfully`);
      this.currentRunId = undefined;
    } catch (error) {
      console.error(`[${this.jobName.toUpperCase()}] Error completing job run:`, error);
      throw error;
    }
  }

  abstract execute(): Promise<void>
}