import { BaseJob } from './BaseJob'
import { generateImagePrompts } from './agentWorkflow'
import { ImageGenerator } from '../services/ImageGenerator'
import { StorageService } from '../services/StorageService'

export class EventProcessJob extends BaseJob {
  constructor() {
    super('event-process')
  }

  async execute(): Promise<void> {
    while (true) {
      try {
        await this.startRun()

        const { data: events, error } = await this.supabase
          .rpc('test_claim_next_event', {
            p_worker_id: this.instanceId,
            p_timeout_minutes: 15
          })

        if (error) throw error
        if (!events?.length) {
          console.log(`[${this.instanceId}] No events to process`)
          await this.completeRun()
          return
        }

        const event = events[0]
        console.log(`[${this.instanceId}] Processing event: ${event.jira_id}`)

        const prompts = await generateImagePrompts(event.summary)

        // Generate images for each prompt
        const imageGenerator = new ImageGenerator();
        const storageService = new StorageService(this.supabase);
        const imageUrls: string[] = [];

        for (const [index, prompt] of prompts.entries()) {
          try {
            const imageBuffers = await imageGenerator.generateImages(prompt.variant.prompt, 1);
            
            // Upload each image
            for (const [bufferIndex, buffer] of imageBuffers.entries()) {
              const filename = `${event.jira_id}_${index}_${bufferIndex}.png`;
              const publicUrl = await storageService.uploadImage(buffer, filename);
              imageUrls.push(publicUrl);
            }
          } catch (error) {
            console.error(`Error generating/uploading image for prompt ${index}:`, error);
          }
        }

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
          .eq('id', event.id)

        await this.completeRun()
        
        // Wait for 5 minutes before checking for new events
        console.log(`[${this.instanceId}] Waiting for 5 minutes before next check...`);
        await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
      } catch (error) {
        console.error(`[${this.instanceId}] Error in EventProcessJob:`, error);
        await this.completeRun(error as Error);
        
        // Wait for 1 minute before retrying on error
        console.log(`[${this.instanceId}] Error occurred, retrying in 1 minute...`);
        await new Promise(resolve => setTimeout(resolve, 60 * 1000));
      }
    }
  }
}