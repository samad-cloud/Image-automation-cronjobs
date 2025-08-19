import { BaseJob } from './BaseJob'
import { generateImagePrompts } from './agentWorkflow'
import { CsvBatch, CsvRowJob } from '../../supabase/types'
import { ImageGenerator } from '../services/ImageGenerator'

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
  private imageGenerator: ImageGenerator

  constructor(userId?: string, batchId?: string, maxConcurrentJobs: number = 3) {
    super('csv-process', userId)
    this.batchId = batchId
    this.maxConcurrentJobs = maxConcurrentJobs
    
    // Initialize OpenAI image generator only
    try {
      this.imageGenerator = new ImageGenerator()
      console.log(`[${this.jobName.toUpperCase()}] OpenAI ImageGenerator initialized successfully`)
    } catch (error) {
      console.error(`[${this.jobName.toUpperCase()}] Failed to initialize OpenAI ImageGenerator:`, error)
      throw new Error(`CSV processing requires OpenAI ImageGenerator: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
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
      .eq('status', 'pending')
      .is('claimed_by', null)
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
    
    console.log(`[${this.jobName.toUpperCase()}] Generated ${generatedPrompts.prompts?.length || 0} prompts`);

    // Generate actual images from the prompts and store in database
    const { generatedImages, generatedImageIds } = await this.generateImagesFromPrompts(generatedPrompts, job.id);
    
    const processingTime = (Date.now() - startTime) / 1000;
    
    console.log(`[${this.jobName.toUpperCase()}] Generated ${generatedImages.length} images with IDs ${generatedImageIds} in ${processingTime.toFixed(2)}s total`);

    return {
      trigger_text: trigger,
      generated_prompts: generatedPrompts,
      generated_images: generatedImages,
      generated_image_ids: generatedImageIds,
      processing_time_seconds: processingTime,
      styles_used: hardcodedStyles
    };
  }

  private async generateImagesFromPrompts(promptsResult: any, jobId: string): Promise<{ generatedImages: any[], generatedImageIds: string[] }> {
    const images: any[] = [];
    const imageIds: string[] = [];
    
    if (!promptsResult.prompts || promptsResult.prompts.length === 0) {
      console.log(`[${this.jobName.toUpperCase()}] No prompts available for image generation`);
      return { generatedImages: images, generatedImageIds: imageIds };
    }

    console.log(`[${this.jobName.toUpperCase()}] Starting image generation for ${promptsResult.prompts.length} prompts`);

    for (let i = 0; i < promptsResult.prompts.length; i++) {
      const promptObj = promptsResult.prompts[i];
      const style = promptObj.style;
      const prompt = promptObj.variant?.prompt;

      if (!prompt) {
        console.log(`[${this.jobName.toUpperCase()}] Skipping prompt ${i + 1}: No prompt text available`);
        continue;
      }

      console.log(`[${this.jobName.toUpperCase()}] Generating image ${i + 1}/${promptsResult.prompts.length} (${style}): "${prompt.substring(0, 100)}..."`);

      try {
        // Use OpenAI DALL-E for image generation only
        console.log(`[${this.jobName.toUpperCase()}] Generating image using OpenAI DALL-E (gpt-image-1)...`);
        
        const imageBuffers = await this.imageGenerator.generateImages(prompt, 1);
        
        if (imageBuffers.length === 0 || !imageBuffers[0]) {
          throw new Error('OpenAI DALL-E returned no image data');
        }

        console.log(`[${this.jobName.toUpperCase()}] Successfully generated image using OpenAI DALL-E`);

        // Convert buffer to base64 for storage
        const imageBase64 = imageBuffers[0].toString('base64');
        
        // Store image in generated_images table
        const { data: imageRecord, error: imageError } = await this.supabase
          .from('generated_images')
          .insert({
            user_id: this.userId,
            trigger: promptsResult.trigger || 'CSV processing',
            prompt: prompt,
            model: 'gpt-image-1',
            image_data: imageBase64,
            filename: `csv_${jobId}_${style}_${i + 1}.png`,
            image_title: promptObj.variant?.Image_title || `${style} image`,
            image_description: promptObj.variant?.Image_description || prompt.substring(0, 200),
            tags: [style, 'csv-generated'],
            metadata: {
              csv_job_id: jobId,
              style: style,
              prompt_index: i,
              generated_from: 'csv-processing'
            }
          })
          .select('id')
          .single();

        if (imageError) {
          console.error(`[${this.jobName.toUpperCase()}] Failed to store image in database:`, imageError);
          throw new Error(`Failed to store image: ${imageError.message}`);
        }

        const imageId = imageRecord.id;
        imageIds.push(imageId);
        
        // Store image metadata for the job result (keeping for backward compatibility)
        images.push({
          id: imageId,
          style: style,
          prompt: prompt,
          image_data: imageBase64,
          generator: 'gpt-image-1',
          generated_at: new Date().toISOString(),
          image_title: promptObj.variant?.Image_title || `${style} image`,
          image_description: promptObj.variant?.Image_description || prompt.substring(0, 200)
        });

        console.log(`[${this.jobName.toUpperCase()}] Successfully generated and stored image for style: ${style} with ID: ${imageId}`);

      } catch (error) {
        console.error(`[${this.jobName.toUpperCase()}] Failed to generate image for style ${style}:`, error);
        
        // Add error entry instead of failing the entire job
        images.push({
          style: style,
          prompt: prompt,
          image_data: null,
          error: error instanceof Error ? error.message : 'Unknown error',
          generated_at: new Date().toISOString(),
          image_title: promptObj.variant?.Image_title || `${style} image (failed)`,
          image_description: promptObj.variant?.Image_description || prompt.substring(0, 200)
        });
      }
    }

    console.log(`[${this.jobName.toUpperCase()}] Image generation complete: ${images.filter(img => img.image_data).length}/${images.length} successful`);
    return { generatedImages: images, generatedImageIds: imageIds };
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
      updateData.p_generated_images = result.generated_images
      updateData.p_generated_image_ids = result.generated_image_ids
      updateData.p_processing_time_seconds = result.processing_time_seconds
      // Store additional metadata
      updateData.p_error_details = {
        styles_used: result.styles_used,
        images_generated: result.generated_images?.length || 0,
        image_ids_generated: result.generated_image_ids?.length || 0,
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
