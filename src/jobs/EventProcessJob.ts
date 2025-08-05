import { BaseJob } from './BaseJob'
import { generateImagePrompts } from './agentWorkflow'
import { ImageGenerator } from '../services/ImageGenerator'
import { StorageService } from '../services/StorageService'

export class EventProcessJob extends BaseJob {
  constructor() {
    super('event-process')
  }

  async execute(): Promise<void> {
    console.log(`[${this.jobName.toUpperCase()}] Starting Event Process execution loop...`);
    while (true) {
      try {
        console.log(`[${this.jobName.toUpperCase()}] Starting new processing cycle...`);
        await this.startRun()

        console.log(`[${this.jobName.toUpperCase()}] Claiming next event from database...`);
        const { data: events, error } = await this.supabase
          .rpc('test_claim_next_event', {
            p_worker_id: this.instanceId,
            p_timeout_minutes: 15
          })

        if (error) {
          console.error(`[${this.jobName.toUpperCase()}] Error claiming event:`, error);
          throw error;
        }
        
        if (!events?.length) {
          console.log(`[${this.jobName.toUpperCase()}] No events to process`);
          await this.completeRun();
          console.log(`[${this.jobName.toUpperCase()}] Waiting for 5 minutes before next check...`);
          await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
          continue;
        }

        const event = events[0]
        console.log(`[${this.jobName.toUpperCase()}] Processing event: ${event.jira_id} with summary: "${event.summary}"`);

        console.log(`[${this.jobName.toUpperCase()}] Starting AI workflow for event: ${event.jira_id}`);
        const prompts = await generateImagePrompts(event.summary)
        console.log(`[${this.jobName.toUpperCase()}] AI workflow completed. Generated ${prompts.length} prompts`);

        // Generate images for each prompt
        console.log(`[${this.jobName.toUpperCase()}] Initializing image generation services...`);
        const imageGenerator = new ImageGenerator();
        const storageService = new StorageService(this.supabase);
        const imageUrls: string[] = [];

        console.log(`[${this.jobName.toUpperCase()}] Starting image generation for ${prompts.length} prompts...`);
        for (const [index, prompt] of prompts.entries()) {
          console.log(`[${this.jobName.toUpperCase()}] Processing prompt ${index + 1}/${prompts.length}: ${prompt.style}`);
          
          // Skip prompts that contain error messages
          if (prompt.variant.prompt.toLowerCase().includes('error') || 
              prompt.variant.prompt.toLowerCase().includes('no products provided') ||
              prompt.variant.prompt.toLowerCase().includes('cannot find products')) {
            console.log(`[${this.jobName.toUpperCase()}] Skipping prompt ${index + 1} due to error message`);
            continue;
          }
          
          try {
            console.log(`[${this.jobName.toUpperCase()}] Generating image for prompt: "${prompt.variant.prompt.substring(0, 100)}..."`);
            const imageBuffers = await imageGenerator.generateImages(prompt.variant.prompt, 1);
            console.log(`[${this.jobName.toUpperCase()}] Generated ${imageBuffers.length} images for prompt ${index + 1}`);
            
            // Upload each image
            for (const [bufferIndex, buffer] of imageBuffers.entries()) {
              const filename = `${event.jira_id}_${index}_${bufferIndex}.png`;
              console.log(`[${this.jobName.toUpperCase()}] Uploading image: ${filename}`);
              const publicUrl = await storageService.uploadImage(buffer, filename);
              imageUrls.push(publicUrl);
              console.log(`[${this.jobName.toUpperCase()}] Successfully uploaded image: ${publicUrl}`);
            }
          } catch (error) {
            console.error(`[${this.jobName.toUpperCase()}] Error generating/uploading image for prompt ${index}:`, error);
          }
        }
        console.log(`[${this.jobName.toUpperCase()}] Image generation completed. Total images uploaded: ${imageUrls.length}`);

        console.log(`[${this.jobName.toUpperCase()}] Updating event status in database...`);
        await this.supabase
          .from('test_calendar_events')
          .update({
            status: 'completed',
            agent_result: prompts,
            image_urls: imageUrls,
            updated_at: new Date().toISOString(),
            processed_by: this.instanceId,
            locked_until: null
          })
          .eq('id', event.id);

        console.log(`[${this.jobName.toUpperCase()}] Event ${event.jira_id} processing completed successfully`);
        await this.completeRun()
        
        // Wait for 5 minutes before checking for new events
        console.log(`[${this.jobName.toUpperCase()}] Waiting for 5 minutes before next check...`);
        await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
      } catch (error) {
        console.error(`[${this.jobName.toUpperCase()}] Error in EventProcessJob:`, error);
        await this.completeRun(error as Error);
        
        // Wait for 1 minute before retrying on error
        console.log(`[${this.jobName.toUpperCase()}] Error occurred, retrying in 1 minute...`);
        await new Promise(resolve => setTimeout(resolve, 60 * 1000));
      }
    }
  }
}