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
  private workerStartTime: Date
  private totalJobsProcessed: number = 0
  private totalJobsFailed: number = 0
  private processingTimes: number[] = []

  constructor(userId?: string, batchId?: string, maxConcurrentJobs: number = 3) {
    super('csv-process', userId)
    this.batchId = batchId
    this.maxConcurrentJobs = maxConcurrentJobs
    this.workerStartTime = new Date()
    
    // Initialize OpenAI image generator only
    try {
      this.imageGenerator = new ImageGenerator()
      // No logging for initialization - not job/batch specific
    } catch (error) {
      // No logging for initialization errors - not job/batch specific
      throw new Error(`CSV processing requires OpenAI ImageGenerator: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  async execute(): Promise<void> {
    console.log(`[${this.jobName.toUpperCase()}] Starting CSV processing execution loop...`);
    console.log(`[${this.jobName.toUpperCase()}] Batch ID: ${this.batchId || 'ALL'}, User ID: ${this.userId || 'ALL'}`);
    console.log(`[${this.jobName.toUpperCase()}] Max concurrent jobs: ${this.maxConcurrentJobs}`);
    
    // No logging for worker startup - not job/batch specific
    
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
      // No logging for job check errors - not job/batch specific
      return false;
    }

    const hasJobs = jobs && jobs.length > 0;
    if (!hasJobs) {
      // No logging for no jobs available - not job/batch specific
    }

    return hasJobs;
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
      // No logging for job claim errors - not job/batch specific
      throw error;
    }

    if (!jobs?.length) {
      console.log(`[${this.jobName.toUpperCase()}] No jobs to process`);
      return;
    }

    const job = jobs[0]
    console.log(`[${this.jobName.toUpperCase()}] Processing job: ${job.id} (batch: ${job.batch_id}, row: ${job.row_number})`);
    
    await this.logMessage('INFO', 'Starting job processing', {
      jobId: job.id,
      batchId: job.batch_id,
      rowNumber: job.row_number
    }, 'job_start', job.batch_id, job.id);

    const jobStartTime = Date.now();
    
    try {
      // Mark job as processing and update worker status
      await this.updateJobStatus(job.id, 'processing')
      await this.updateWorkerHeartbeat('processing', 1, 0, 0)

      // Process the row
      const result = await this.processRow(job)

      // Calculate processing time
      const processingTimeSeconds = (Date.now() - jobStartTime) / 1000;
      this.processingTimes.push(processingTimeSeconds);
      
      // Keep only last 100 processing times for average calculation
      if (this.processingTimes.length > 100) {
        this.processingTimes = this.processingTimes.slice(-100);
      }

      // Update job with results
      await this.updateJobStatus(job.id, 'completed', result)

      // Update worker stats (completed job)
      await this.updateWorkerHeartbeat('idle', 0, 1, 0)

      console.log(`[${this.jobName.toUpperCase()}] Successfully completed job: ${job.id} in ${processingTimeSeconds.toFixed(2)}s`);
      
      await this.logMessage('INFO', 'Job completed successfully', {
        jobId: job.id,
        processingTimeSeconds: processingTimeSeconds,
        imagesGenerated: result.generated_images?.length || 0,
        promptsGenerated: result.generated_prompts?.prompts?.length || 0
      }, 'job_complete', job.batch_id, job.id, Math.round(processingTimeSeconds * 1000));
      
    } catch (error) {
      console.error(`[${this.jobName.toUpperCase()}] Error processing job ${job.id}:`, error);
      
      await this.logMessage('ERROR', 'Job processing failed', {
        jobId: job.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      }, 'job_error', job.batch_id, job.id);
      
      // Update job with error
      await this.updateJobStatus(job.id, 'failed', null, error as Error)
      
      // Update worker stats (failed job)
      await this.updateWorkerHeartbeat('error', 0, 0, 1)
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

    // Create image_generations record to track this generation request
    const imageGenerationRecord = await this.createImageGenerationRecord(trigger, rowData, job);

    // Generate image prompts using existing agentic workflow with hardcoded styles
    // Call generateImagePrompts once for each style since it only generates one prompt per call
    const hardcodedStyles = ['lifestyle_emotional', 'white_background'];
    console.log(`[${this.jobName.toUpperCase()}] Using hardcoded styles:`, hardcodedStyles);
    
    const allPrompts: any[] = [];
    
    for (const style of hardcodedStyles) {
      console.log(`[${this.jobName.toUpperCase()}] Generating prompt for style: ${style}`);
      try {
        const stylePrompts = await generateImagePrompts(trigger, [style]);
        console.log(`[${this.jobName.toUpperCase()}] Generated ${stylePrompts.prompts?.length || 0} prompts for ${style}`);
        
        if (stylePrompts.prompts && stylePrompts.prompts.length > 0) {
          allPrompts.push(...stylePrompts.prompts);
        }
      } catch (error) {
        console.error(`[${this.jobName.toUpperCase()}] Failed to generate prompt for style ${style}:`, error);
        await this.logMessage('ERROR', 'Failed to generate prompt for style', {
          style: style,
          error: error instanceof Error ? error.message : 'Unknown error'
        }, 'prompt_generation_error', undefined, job.id);
      }
    }
    
    const generatedPrompts = { prompts: allPrompts };
    
    console.log(`[${this.jobName.toUpperCase()}] Generated ${generatedPrompts.prompts?.length || 0} total prompts`);
    console.log(`[${this.jobName.toUpperCase()}] Prompt details:`, generatedPrompts.prompts?.map((p: any) => ({ style: p.style, hasPrompt: !!p.variant?.prompt })));

    // Generate actual images from the prompts and store in database
    const { generatedImages, generatedImageIds } = await this.generateImagesFromPrompts(generatedPrompts, job.id, imageGenerationRecord.id);
    
    // Update image_generations record with completion status and image IDs
    await this.updateImageGenerationRecord(imageGenerationRecord.id, generatedPrompts, generatedImageIds, generatedImages.length > 0 ? 'completed' : 'failed');
    
    const processingTime = (Date.now() - startTime) / 1000;
    
    console.log(`[${this.jobName.toUpperCase()}] Generated ${generatedImages.length} images with IDs ${generatedImageIds} in ${processingTime.toFixed(2)}s total`);

    return {
      trigger_text: trigger,
      generated_prompts: generatedPrompts,
      generated_images: generatedImages,
      generated_image_ids: generatedImageIds,
      processing_time_seconds: processingTime,
      styles_used: hardcodedStyles,
      image_generation_id: imageGenerationRecord.id
    };
  }

  private async generateImagesFromPrompts(promptsResult: any, jobId: string, imageGenerationId: string): Promise<{ generatedImages: any[], generatedImageIds: string[] }> {
    const images: any[] = [];
    const imageIds: string[] = [];
    
    if (!promptsResult.prompts || promptsResult.prompts.length === 0) {
      console.log(`[${this.jobName.toUpperCase()}] No prompts available for image generation`);
      return { generatedImages: images, generatedImageIds: imageIds };
    }

    console.log(`[${this.jobName.toUpperCase()}] Starting image generation for ${promptsResult.prompts.length} prompts`);
    console.log(`[${this.jobName.toUpperCase()}] Prompts breakdown:`, promptsResult.prompts.map((p: any) => ({ style: p.style, hasVariant: !!p.variant, hasPrompt: !!p.variant?.prompt })));
    
    // Get batch_id from the CSV job processing context
    const batchIdForLogging = this.batchId;
    
    await this.logMessage('INFO', 'Starting image generation', {
      promptCount: promptsResult.prompts.length,
      promptsBreakdown: promptsResult.prompts.map((p: any) => ({ style: p.style, hasPrompt: !!p.variant?.prompt })),
      jobId: jobId
    }, 'image_generation_start', batchIdForLogging, jobId);

    for (let i = 0; i < promptsResult.prompts.length; i++) {
      const promptObj = promptsResult.prompts[i];
      const style = promptObj.style;
      const prompt = promptObj.variant?.prompt;

      if (!prompt) {
        console.log(`[${this.jobName.toUpperCase()}] Skipping prompt ${i + 1}: No prompt text available for style ${style}`);
        console.log(`[${this.jobName.toUpperCase()}] Prompt object:`, JSON.stringify(promptObj, null, 2));
        // Skipping prompt without logging - not essential for job/batch tracking
        continue;
      }

      console.log(`[${this.jobName.toUpperCase()}] Generating image ${i + 1}/${promptsResult.prompts.length} (${style}): "${prompt.substring(0, 100)}..."`);

      const imageStartTime = Date.now();
      
      try {
        // Use OpenAI DALL-E for image generation only
        console.log(`[${this.jobName.toUpperCase()}] Generating image using OpenAI DALL-E (gpt-image-1)...`);
        
        // No logging for individual DALL-E starts - too verbose
        
        const imageBuffers = await this.imageGenerator.generateImages(prompt, 1);
        
        if (imageBuffers.length === 0 || !imageBuffers[0]) {
          throw new Error('OpenAI DALL-E returned no image data');
        }

        console.log(`[${this.jobName.toUpperCase()}] Successfully generated image using OpenAI DALL-E`);

        // Convert buffer to base64 for storage
        const imageBase64 = imageBuffers[0].toString('base64');
        
        // Store image in google_sem storage bucket
        const filename = `csv_${jobId}_${style}_${i + 1}.png`;
        const storagePath = `csv-generated/${this.userId || 'system'}/${filename}`;
        
        const { data: storageData, error: storageError } = await this.supabase.storage
          .from('google_sem')
          .upload(storagePath, imageBuffers[0], {
            contentType: 'image/png',
            upsert: false
          });

        if (storageError) {
          console.error(`[${this.jobName.toUpperCase()}] Failed to upload image to storage:`, storageError);
                  await this.logMessage('ERROR', 'Failed to upload image to storage', {
          error: storageError.message || JSON.stringify(storageError),
          storagePath: storagePath,
          style: style
        }, 'storage_upload_error', batchIdForLogging, jobId);
          throw new Error(`Failed to upload image to storage: ${storageError.message || 'Unknown error'}`);
        }

        // Get public URL for the uploaded image
        const { data: publicUrlData } = await this.supabase.storage
          .from('google_sem')
          .getPublicUrl(storagePath);

        const storageUrl = publicUrlData.publicUrl;
        
        await this.logMessage('INFO', 'Image uploaded to storage successfully', {
          storagePath: storagePath,
          storageUrl: storageUrl,
          style: style
        }, 'storage_upload_success', batchIdForLogging, jobId);
        
        // Store image in images table with correct column names
        const { data: imageRecord, error: imageError } = await this.supabase
          .from('images')
          .insert({
            storage_url: storageUrl,
            title: promptObj.variant?.Image_title || `${style} image`,
            description: promptObj.variant?.Image_description || prompt.substring(0, 200),
            tags: [style, 'csv-generated'],
            style_type: style,
            prompt_used: prompt,
            model_name: 'gpt-image-1',
            generation_source: 'csv', // CSV processing source
            format: 'png',
            generation_id: imageGenerationId, // Link to image_generations record
            generation_metadata: {
              csv_job_id: jobId,
              style: style,
              prompt_index: i,
              generated_from: 'csv-processing',
              user_id: this.userId,
              trigger: promptsResult.trigger || 'CSV processing',
              image_data: imageBase64, // Store base64 data in metadata for backup
              filename: filename,
              storage_path: storagePath,
              storage_bucket: 'google_sem'
            },
            manual_request_data: {
              batch_id: this.batchId,
              worker_instance: this.instanceId,
              processing_time: Date.now() - imageStartTime,
              storage_upload: {
                bucket: 'google_sem',
                path: storagePath,
                url: storageUrl
              }
            }
          })
          .select('id')
          .single();

        if (imageError) {
          console.error(`[${this.jobName.toUpperCase()}] Failed to store image in database:`, imageError);
          const errorMessage = imageError.message || imageError.details || JSON.stringify(imageError);
          throw new Error(`Failed to store image: ${errorMessage}`);
        }

        const imageId = imageRecord.id;
        imageIds.push(imageId);
        
        // Store image metadata for the job result (keeping for backward compatibility)
        images.push({
          id: imageId,
          style: style,
          prompt: prompt,
          image_data: imageBase64,
          storage_url: storageUrl,
          storage_path: storagePath,
          storage_bucket: 'google_sem',
          generator: 'gpt-image-1',
          generated_at: new Date().toISOString(),
          image_title: promptObj.variant?.Image_title || `${style} image`,
          image_description: promptObj.variant?.Image_description || prompt.substring(0, 200),
          filename: filename,
          metadata: {
            csv_job_id: jobId,
            style: style,
            prompt_index: i,
            generated_from: 'csv-processing',
            user_id: this.userId,
            trigger: promptsResult.trigger || 'CSV processing',
            tags: [style, 'csv-generated'],
            storage: {
              bucket: 'google_sem',
              path: storagePath,
              url: storageUrl
            }
          }
        });

        const imageGenerationTime = Date.now() - imageStartTime;
        console.log(`[${this.jobName.toUpperCase()}] Successfully generated and stored image for style: ${style} with ID: ${imageId}`);

        await this.logMessage('INFO', 'Image generated and stored successfully', {
          style: style,
          imageId: imageId,
          promptIndex: i + 1,
          generationTimeMs: imageGenerationTime,
          imageSize: imageBase64.length,
          storageUrl: storageUrl,
          storagePath: storagePath,
          storageBucket: 'google_sem'
        }, 'image_generation_success', batchIdForLogging, jobId, imageGenerationTime);

      } catch (error) {
        const imageGenerationTime = Date.now() - imageStartTime;
        console.error(`[${this.jobName.toUpperCase()}] Failed to generate image for style ${style}:`, error);
        
        await this.logMessage('ERROR', 'Image generation failed', {
          style: style,
          promptIndex: i + 1,
          error: error instanceof Error ? error.message : 'Unknown error',
          generationTimeMs: imageGenerationTime,
          stack: error instanceof Error ? error.stack : undefined
        }, 'image_generation_error', batchIdForLogging, jobId, imageGenerationTime);
        
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

    const successfulImages = images.filter(img => img.image_data);
    console.log(`[${this.jobName.toUpperCase()}] Image generation complete: ${successfulImages.length}/${images.length} successful`);
    console.log(`[${this.jobName.toUpperCase()}] Generated styles:`, successfulImages.map(img => img.style));
    
    await this.logMessage('INFO', 'Image generation batch completed', {
      totalPrompts: promptsResult.prompts.length,
      successfulImages: successfulImages.length,
      failedImages: images.length - successfulImages.length,
      stylesGenerated: successfulImages.map(img => img.style),
      imageIds: imageIds
    }, 'image_generation_complete', undefined, jobId);
    
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

  // CSV Processing Logging
  private async logMessage(
    level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL',
    message: string,
    details?: any,
    operation?: string,
    batchId?: string,
    rowJobId?: string,
    durationMs?: number
  ): Promise<void> {
    try {
      const logEntry = {
        batch_id: batchId || this.batchId || null,
        row_job_id: rowJobId || null,
        worker_instance_id: this.instanceId,
        log_level: level,
        message: message,
        details: details ? (typeof details === 'object' ? details : { data: details }) : null,
        operation: operation || null,
        duration_ms: durationMs || null,
        created_at: new Date().toISOString()
      };

      const { error } = await this.supabase
        .from('csv_processing_logs')
        .insert(logEntry);

      if (error) {
        console.error(`[${this.jobName.toUpperCase()}] Failed to insert log:`, error);
        // Don't throw - logging failures shouldn't stop processing
      }
    } catch (error) {
      console.error(`[${this.jobName.toUpperCase()}] Error in logging:`, error);
      // Don't throw - logging failures shouldn't stop processing
    }
  }

  // Update worker heartbeat to track this worker's activity
  private async updateWorkerHeartbeat(
    status: 'idle' | 'processing' | 'paused' | 'stopped' | 'error' = 'processing',
    currentJobCount: number = 0,
    jobsCompletedDelta: number = 0,
    jobsFailedDelta: number = 0
  ): Promise<void> {
    try {
      // Calculate average processing time
      const averageProcessingTime = this.processingTimes.length > 0 
        ? this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length 
        : 0;

      // Update totals
      this.totalJobsProcessed += jobsCompletedDelta;
      this.totalJobsFailed += jobsFailedDelta;

      // Get worker version from package.json
      const workerVersion = process.env.npm_package_version || '1.0.0';

      // Prepare worker config
      const workerConfig = {
        max_concurrent_jobs: this.maxConcurrentJobs,
        batch_id: this.batchId,
        user_id: this.userId,
        worker_type: 'csv-process',
        node_version: process.version,
        started_at: this.workerStartTime.toISOString()
      };

      // Insert or update worker record with all columns
      const { error } = await this.supabase
        .from('csv_processing_workers')
        .upsert({
          instance_id: this.instanceId,
          user_id: this.userId || null,
          batch_id: this.batchId || null,
          status: status,
          max_concurrent_jobs: this.maxConcurrentJobs,
          current_job_count: currentJobCount,
          total_jobs_processed: this.totalJobsProcessed,
          total_jobs_failed: this.totalJobsFailed,
          average_processing_time_seconds: averageProcessingTime,
          last_heartbeat: new Date().toISOString(),
          last_job_completed_at: jobsCompletedDelta > 0 ? new Date().toISOString() : undefined,
          worker_version: workerVersion,
          worker_config: workerConfig,
          started_at: status === 'processing' && this.totalJobsProcessed === 0 ? new Date().toISOString() : undefined,
          stopped_at: status === 'stopped' ? new Date().toISOString() : undefined
        }, {
          onConflict: 'instance_id'
        });

      if (error) {
        console.error(`[${this.jobName.toUpperCase()}] Error updating worker record:`, error);
      } else {
        console.log(`[${this.jobName.toUpperCase()}] Worker heartbeat updated: ${status} (jobs: ${this.totalJobsProcessed}, failed: ${this.totalJobsFailed}, avg: ${averageProcessingTime.toFixed(2)}s)`);
      }
    } catch (error) {
      console.error(`[${this.jobName.toUpperCase()}] Error updating worker heartbeat:`, error);
      // Don't throw - heartbeat failures shouldn't stop job processing
    }
  }

  /**
   * Create a record in image_generations table to track the CSV generation request
   */
  private async createImageGenerationRecord(trigger: string, rowData: CsvRowData, job: any): Promise<any> {
    try {
      const { data, error } = await this.supabase
        .from('image_generations')
        .insert({
          user_id: this.userId,
          trigger: trigger,
          persona: null, // CSV doesn't have persona data
          products: rowData, // Store the entire row data as products
          prompt_json: null, // Will be updated after prompt generation
          style: 'lifestyle_emotional,white_background', // Both styles we're generating
          model: 'gpt-image-1', // Our image generation model
          image_ids: null, // Will be updated after image generation
          status: 'pending',
          started_at: new Date().toISOString(),
          completed_at: null,
          error_message: null,
          calendar_event_id: null, // CSV doesn't relate to calendar events
          event_summary: null,
          user_style_preferences: [],
          number_of_variations_requested: 2, // Two styles = two variations
          generation_source: 'csv', // New source type for CSV
          manual_trigger_data: {
            csv_batch_id: job.batch_id,
            csv_row_job_id: job.id,
            csv_row_data: rowData
          }
        })
        .select('id')
        .single();

      if (error) {
        console.error(`[${this.jobName.toUpperCase()}] Error creating image_generations record:`, error);
        throw error;
      }

      console.log(`[${this.jobName.toUpperCase()}] Created image_generations record with ID: ${data.id}`);
      
      await this.logMessage('INFO', 'Created image_generations record', {
        imageGenerationId: data.id,
        trigger: trigger,
        csvRowJobId: job.id,
        batchId: job.batch_id
      }, 'image_generation_record_created', undefined, job.id);

      return data;
    } catch (error) {
      console.error(`[${this.jobName.toUpperCase()}] Failed to create image_generations record:`, error);
      throw error;
    }
  }

  /**
   * Update the image_generations record with completion status and results
   */
  private async updateImageGenerationRecord(imageGenerationId: string, promptsResult: any, imageIds: string[], status: string): Promise<void> {
    try {
      const updateData: any = {
        prompt_json: promptsResult,
        image_ids: imageIds,
        status: status,
        completed_at: new Date().toISOString()
      };

      // If failed status, we might want to add error message
      if (status === 'failed' && imageIds.length === 0) {
        updateData.error_message = 'No images were successfully generated';
      }

      const { error } = await this.supabase
        .from('image_generations')
        .update(updateData)
        .eq('id', imageGenerationId);

      if (error) {
        console.error(`[${this.jobName.toUpperCase()}] Error updating image_generations record:`, error);
        throw error;
      }

      console.log(`[${this.jobName.toUpperCase()}] Updated image_generations record ${imageGenerationId} with status: ${status}, images: ${imageIds.length}`);
      
      await this.logMessage('INFO', 'Updated image_generations record', {
        imageGenerationId: imageGenerationId,
        status: status,
        imageCount: imageIds.length,
        promptCount: promptsResult.prompts?.length || 0
      }, 'image_generation_record_updated');

    } catch (error) {
      console.error(`[${this.jobName.toUpperCase()}] Failed to update image_generations record:`, error);
      // Don't throw - this shouldn't stop the job processing
    }
  }

  protected async startRun(metadata?: any) {
    await super.startRun(metadata)
    // Register worker as started
    await this.updateWorkerHeartbeat('processing', 0, 0, 0)
    console.log(`[${this.jobName.toUpperCase()}] Worker registered with instance ID: ${this.instanceId}`);
    
    // No logging for worker cycle start - not job/batch specific
  }

  protected async completeRun(error?: Error) {
    // Final worker status update
    const finalStatus = error ? 'error' : 'stopped';
    await this.updateWorkerHeartbeat(finalStatus, 0, 0, 0)
    
    console.log(`[${this.jobName.toUpperCase()}] Worker shutdown: processed ${this.totalJobsProcessed} jobs, ${this.totalJobsFailed} failed`);
    
    const runtimeSeconds = (Date.now() - this.workerStartTime.getTime()) / 1000;
    
    // No logging for worker cycle completion - not job/batch specific
    
    await super.completeRun(error)
  }
}
