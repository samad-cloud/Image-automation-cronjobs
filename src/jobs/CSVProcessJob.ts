import { BaseJob } from './BaseJob'
import { generateImagePrompts } from './agentWorkflow'
import { CsvBatch, CsvRowJob } from '../../supabase/types'

interface CsvRowData {
  country: string
  product_type: string
  mpn: string
  size?: string
  title?: string
  description?: string
  [key: string]: any // Allow additional fields
}

export class CSVProcessJob extends BaseJob {
  private batchId?: string
  private maxConcurrentJobs: number

  constructor(userId?: string, batchId?: string, maxConcurrentJobs: number = 3) {
    super('csv-process', userId)
    this.batchId = batchId
    this.maxConcurrentJobs = maxConcurrentJobs
  }

  async execute(): Promise<void> {
    console.log(`[${this.jobName.toUpperCase()}] Starting CSV processing execution loop...`);
    console.log(`[${this.jobName.toUpperCase()}] Batch ID: ${this.batchId || 'ALL'}, User ID: ${this.userId || 'ALL'}`);
    console.log(`[${this.jobName.toUpperCase()}] Max concurrent jobs: ${this.maxConcurrentJobs}`);
    
    while (true) {
      try {
        console.log(`[${this.jobName.toUpperCase()}] Starting new processing cycle...`);
        await this.startRun()

        // Track active processing promises
        const activeJobs: Promise<void>[] = []

        // Process jobs concurrently up to the limit
        for (let i = 0; i < this.maxConcurrentJobs; i++) {
          try {
            const hasJob = await this.hasAvailableJob()
            if (hasJob) {
              const jobPromise = this.processNextJob()
              activeJobs.push(jobPromise)
            } else {
              break; // No more jobs available
            }
          } catch (error) {
            console.error(`[${this.jobName.toUpperCase()}] Error checking for available jobs:`, error);
            break;
          }
        }

        // Wait for at least one job to complete or all to finish
        if (activeJobs.length > 0) {
          await Promise.allSettled(activeJobs)
        } else {
          // No jobs available, wait before checking again
          console.log(`[${this.jobName.toUpperCase()}] No jobs available, waiting 30 seconds...`);
          await this.completeRun();
          await new Promise(resolve => setTimeout(resolve, 30 * 1000));
          continue;
        }

        await this.completeRun();
        
        // Short pause between cycles
        await new Promise(resolve => setTimeout(resolve, 5 * 1000));
      } catch (error) {
        console.error(`[${this.jobName.toUpperCase()}] Error in CSV processing cycle:`, error);
        await this.completeRun(error as Error);
        
        // Wait before retrying on error
        console.log(`[${this.jobName.toUpperCase()}] Error occurred, retrying in 30 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 30 * 1000));
      }
    }
  }

  private async hasAvailableJob(): Promise<boolean> {
    const { data: jobs, error } = await this.supabase
      .from('csv_row_jobs')
      .select('id')
      .eq('status', 'queued')
      .is('worker_instance_id', null)
      .limit(1)

    if (error) {
      console.error(`[${this.jobName.toUpperCase()}] Error checking for available jobs:`, error);
      return false;
    }

    return jobs && jobs.length > 0;
  }

  private async processNextJob(): Promise<void> {
    console.log(`[${this.jobName.toUpperCase()}] Claiming next CSV row job...`);
    
    const { data: jobs, error } = await this.supabase
      .rpc('claim_next_csv_row_job', {
        p_worker_instance_id: this.instanceId,
        p_batch_id: this.batchId || null,
        p_timeout_minutes: 15
      })

    if (error) {
      console.error(`[${this.jobName.toUpperCase()}] Error claiming job:`, error);
      throw error;
    }

    if (!jobs?.length) {
      console.log(`[${this.jobName.toUpperCase()}] No jobs to process`);
      return;
    }

    const job = jobs[0]
    console.log(`[${this.jobName.toUpperCase()}] Processing job: ${job.id} (batch: ${job.batch_id}, row: ${job.row_number})`);

    try {
      // Mark job as processing
      await this.updateJobStatus(job.id, 'processing')

      // Process the row
      const result = await this.processRow(job)

      // Update job with results
      await this.updateJobStatus(job.id, 'completed', result)

      console.log(`[${this.jobName.toUpperCase()}] Successfully completed job: ${job.id}`);
    } catch (error) {
      console.error(`[${this.jobName.toUpperCase()}] Error processing job ${job.id}:`, error);
      
      // Update job with error
      await this.updateJobStatus(job.id, 'failed', null, error as Error)
    }
  }

  private buildTriggerFromRow(rowData: CsvRowData): string {
    const { country, product_type, mpn, size, title, description } = rowData;
    
    // Build trigger exactly as specified: country + product_type + size + mpn + description
    const triggerParts = [
      country && `Country: ${country}`,
      product_type && `Product Type: ${product_type}`,
      size && `Size: ${size}`,
      mpn && `MPN: ${mpn}`,
      description && `Description: ${description}`
    ].filter(Boolean); // Remove any undefined/empty parts
    
    const trigger = triggerParts.join('\n');
    console.log(`[${this.jobName.toUpperCase()}] Built trigger:`, trigger);
    
    return trigger;
  }

  private async processRow(job: any): Promise<any> {
    const startTime = Date.now();
    const rowData = job.row_data as CsvRowData;
    
    console.log(`[${this.jobName.toUpperCase()}] Processing row data:`, rowData);

    // Build trigger from row data
    const trigger = this.buildTriggerFromRow(rowData);

    // Generate image prompts using existing agentic workflow with hardcoded styles
    const hardcodedStyles = ['lifestyle_emotional', 'single_white_background'];
    console.log(`[${this.jobName.toUpperCase()}] Using hardcoded styles:`, hardcodedStyles);
    
    const generatedPrompts = await generateImagePrompts(trigger, hardcodedStyles);
    
    const processingTime = (Date.now() - startTime) / 1000;
    
    console.log(`[${this.jobName.toUpperCase()}] Generated ${generatedPrompts.prompts?.length || 0} prompts in ${processingTime.toFixed(2)}s`);

    return {
      trigger_text: trigger,
      generated_prompts: generatedPrompts,
      processing_time_seconds: processingTime,
      styles_used: hardcodedStyles
    };
  }

  private async updateJobStatus(
    jobId: string, 
    status: 'processing' | 'completed' | 'failed',
    result?: any,
    error?: Error
  ): Promise<void> {
    console.log(`[${this.jobName.toUpperCase()}] Updating job ${jobId} status to: ${status}`);

    const updateData: any = {
      p_job_id: jobId,
      p_status: status
    }

    if (result) {
      updateData.p_trigger_text = result.trigger_text
      updateData.p_generated_prompts = result.generated_prompts
      updateData.p_processing_time_seconds = result.processing_time_seconds
      // Store additional metadata
      updateData.p_error_details = {
        styles_used: result.styles_used,
        timestamp: new Date().toISOString()
      }
    }

    if (error) {
      updateData.p_error_message = error.message
      updateData.p_error_details = {
        error_stack: error.stack,
        timestamp: new Date().toISOString()
      }
    }

    const { error: updateError } = await this.supabase
      .rpc('update_csv_row_job_result', updateData)

    if (updateError) {
      console.error(`[${this.jobName.toUpperCase()}] Error updating job status:`, updateError);
      throw updateError;
    }
  }

  // Update worker heartbeat to track this worker's activity
  private async updateWorkerHeartbeat(
    status: 'idle' | 'processing' | 'stopped' = 'processing',
    currentJobCount: number = 0,
    jobsCompletedDelta: number = 0,
    jobsFailedDelta: number = 0
  ): Promise<void> {
    try {
      await this.supabase.rpc('update_csv_worker_heartbeat', {
        p_instance_id: this.instanceId,
        p_status: status,
        p_current_job_count: currentJobCount,
        p_jobs_completed_delta: jobsCompletedDelta,
        p_jobs_failed_delta: jobsFailedDelta
      })
    } catch (error) {
      console.error(`[${this.jobName.toUpperCase()}] Error updating worker heartbeat:`, error);
      // Don't throw - heartbeat failures shouldn't stop job processing
    }
  }

  protected async startRun(metadata?: any) {
    await super.startRun(metadata)
    await this.updateWorkerHeartbeat('processing')
  }

  protected async completeRun(error?: Error) {
    await this.updateWorkerHeartbeat(error ? 'stopped' : 'idle')
    await super.completeRun(error)
  }
}
