import { BaseJob } from './BaseJob'
import { generateImagePrompts } from './agentWorkflow'
import { ImageGenerator } from '../services/ImageGenerator'
import { ImagenGenerator } from '../services/ImagenGenerator'
import { StorageService } from '../services/StorageService'
import { generateTags } from '../agents/tagAgent'
import { ImageData, TagData } from '../../supabase/types'

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

        // Initialize image generators and storage service
        console.log(`[${this.jobName.toUpperCase()}] Initializing image generation and tag generation services...`);
        const gptImageGenerator = new ImageGenerator();
        const imagenGenerator = new ImagenGenerator();
        const storageService = new StorageService(this.supabase);
        
        const imageData: ImageData[] = [];
        const tagData: TagData[] = [];

        console.log(`[${this.jobName.toUpperCase()}] Starting dual image and tag generation for ${prompts.length} prompts...`);
        for (const [promptIndex, prompt] of prompts.entries()) {
          console.log(`[${this.jobName.toUpperCase()}] Processing prompt ${promptIndex + 1}/${prompts.length}: ${prompt.style}`);
          
          // Skip prompts that contain error messages
          if (prompt.variant.prompt.toLowerCase().includes('error') || 
              prompt.variant.prompt.toLowerCase().includes('no products provided') ||
              prompt.variant.prompt.toLowerCase().includes('cannot find products')) {
            console.log(`[${this.jobName.toUpperCase()}] Skipping prompt ${promptIndex + 1} due to error message`);
            continue;
          }
          
          try {
            // Generate tags for this prompt (will be used for both images)
            console.log(`[${this.jobName.toUpperCase()}] Generating tags for prompt ${promptIndex + 1}...`);
            const tags = await generateTags(prompt.variant.prompt, event.summary);
            console.log(`[${this.jobName.toUpperCase()}] Generated ${tags.length} tags for prompt ${promptIndex + 1}`);
            
            // Generate images with both models in parallel
            console.log(`[${this.jobName.toUpperCase()}] Starting dual image generation for prompt: "${prompt.variant.prompt.substring(0, 100)}..."`);
            
            const [gptImages, imagenImages] = await Promise.all([
              gptImageGenerator.generateImages(prompt.variant.prompt, 1),
              imagenGenerator.generateImages(prompt.variant.prompt, 1)
            ]);
            
            console.log(`[${this.jobName.toUpperCase()}] Generated ${gptImages.length} GPT images and ${imagenImages.length} Imagen images for prompt ${promptIndex + 1}`);
            
            // Process GPT images
            for (const [imageIndex, buffer] of gptImages.entries()) {
              const filename = `${event.jira_id}_prompt${promptIndex}_gpt_${imageIndex}.png`;
              console.log(`[${this.jobName.toUpperCase()}] Uploading GPT image: ${filename}`);
              const publicUrl = await storageService.uploadImage(buffer, filename);
              
              // Add image data
              imageData.push({
                url: publicUrl,
                model: 'gpt-image-1',
                prompt_index: promptIndex,
                image_index: imageIndex,
                filename: filename,
                generated_at: new Date().toISOString()
              });
              
              // Add tag data for this image
              tagData.push({
                tags: tags,
                prompt_index: promptIndex,
                image_index: imageIndex,
                model: 'gpt-image-1'
              });
              
              console.log(`[${this.jobName.toUpperCase()}] Successfully uploaded GPT image: ${publicUrl}`);
            }
            
            // Process Imagen images
            for (const [imageIndex, buffer] of imagenImages.entries()) {
              const filename = `${event.jira_id}_prompt${promptIndex}_imagen_${imageIndex}.png`;
              console.log(`[${this.jobName.toUpperCase()}] Uploading Imagen image: ${filename}`);
              const publicUrl = await storageService.uploadImage(buffer, filename);
              
              // Add image data
              imageData.push({
                url: publicUrl,
                model: 'imagen-4.0-ultra',
                prompt_index: promptIndex,
                image_index: imageIndex,
                filename: filename,
                generated_at: new Date().toISOString()
              });
              
              // Add tag data for this image
              tagData.push({
                tags: tags,
                prompt_index: promptIndex,
                image_index: imageIndex,
                model: 'imagen-4.0-ultra'
              });
              
              console.log(`[${this.jobName.toUpperCase()}] Successfully uploaded Imagen image: ${publicUrl}`);
            }
            
          } catch (error) {
            console.error(`[${this.jobName.toUpperCase()}] Error generating/uploading images or tags for prompt ${promptIndex}:`, error);
          }
        }
        
        console.log(`[${this.jobName.toUpperCase()}] Dual image and tag generation completed. Total images uploaded: ${imageData.length}, Total tag sets: ${tagData.length}`);

        console.log(`[${this.jobName.toUpperCase()}] Updating event status in database...`);
        await this.supabase
          .from('test_calendar_events')
          .update({
            status: 'completed',
            agent_result: prompts,
            image_data: imageData,
            tag_data: tagData,
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