import { BaseJob } from './BaseJob'
import { CalendarEventRow, GenerationRequest } from '../../supabase/types'
import { generateImagePrompts } from './agentWorkflow'
import { ImageGenerator } from '../services/ImageGenerator'
import { StorageService } from '../services/StorageService'
import { generateTags } from '../agents/tagAgent'

export class MultiUserEventProcessJob extends BaseJob {
  private imageGenerator: ImageGenerator
  private storageService: StorageService

  constructor(userId?: string) {
    super('event-process', userId)
    this.imageGenerator = new ImageGenerator()
    this.storageService = new StorageService(this.supabase)
  }

  async execute(): Promise<void> {
    console.log(`[${this.jobName.toUpperCase()}] Starting Multi-User Event Process execution loop...`);
    
    while (true) {
      try {
        console.log(`[${this.jobName.toUpperCase()}] Starting new processing cycle...`);
        await this.startRun()

        // Claim next calendar event for processing
        const event = await this.claimNextCalendarEvent()
        
        if (!event) {
          console.log(`[${this.jobName.toUpperCase()}] No events to process`);
          await this.completeRun();
          console.log(`[${this.jobName.toUpperCase()}] Waiting for 5 minutes before next check...`);
          await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
          continue;
        }

        console.log(`[${this.jobName.toUpperCase()}] Processing calendar event: ${event.id} for user: ${event.user_id}`);

        try {
          // Process the event through our new image generation pipeline
          const result = await this.processCalendarEvent(event)
          
          // Double-check that images were actually generated before marking as completed
          if (result && result.images && result.images.length > 0) {
            await this.updateCalendarEventStatus(event.id, 'completed')
            console.log(`[${this.jobName.toUpperCase()}] Event ${event.id} processing completed successfully with ${result.images.length} images`);
          } else {
            await this.updateCalendarEventStatus(event.id, 'failed', 'No images were successfully generated')
            console.log(`[${this.jobName.toUpperCase()}] Event ${event.id} processing failed: No images generated`);
          }
        } catch (processingError) {
          console.error(`[${this.jobName.toUpperCase()}] Error processing event ${event.id}:`, processingError);
          
          // Mark event as failed
          await this.updateCalendarEventStatus(event.id, 'failed', 
            processingError instanceof Error ? processingError.message : 'Unknown error'
          )
        }
        
        await this.completeRun()
        
        // Wait for 5 minutes before checking for new events
        console.log(`[${this.jobName.toUpperCase()}] Waiting for 5 minutes before next check...`);
        await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
      } catch (error) {
        console.error(`[${this.jobName.toUpperCase()}] Error in MultiUserEventProcessJob:`, error);
        await this.completeRun(error as Error);
        
        // Wait for 1 minute before retrying on error
        console.log(`[${this.jobName.toUpperCase()}] Error occurred, retrying in 1 minute...`);
        await new Promise(resolve => setTimeout(resolve, 60 * 1000));
      }
    }
  }

  private async claimNextCalendarEvent(): Promise<CalendarEventRow | null> {
    console.log(`[${this.jobName.toUpperCase()}] Claiming next calendar event...`);
    
    const { data: events, error } = await this.supabase
      .rpc('claim_next_calendar_event', {
        p_worker_id: this.instanceId,
        p_timeout_minutes: 15,
        p_user_id: this.userId || null // Support both single-user and multi-user modes
      }) as { data: CalendarEventRow[] | null, error: any }

    if (error) {
      console.error(`[${this.jobName.toUpperCase()}] Error claiming event:`, error);
      throw error;
    }

    const event = events?.[0] || null
    if (event) {
      console.log(`[${this.jobName.toUpperCase()}] Claimed event: ${event.id} - "${event.summary}" for user: ${event.user_id}`);
    }

    return event
  }

  private async processCalendarEvent(event: CalendarEventRow): Promise<{ generation: any, images: any[] }> {
    console.log(`[${this.jobName.toUpperCase()}] Starting image generation for event: ${event.id}`);

    // Create the generation request
    const generationRequest: GenerationRequest = {
      source: 'calendar',
      user_id: event.user_id,
      calendar_event_id: event.id,
      trigger: event.summary,
      styles: event.styles || ['Lifestyle + Subject'],
      number_of_variations: event.number_of_variations || 1
    }

    // Process through the unified image generation pipeline
    const result = await this.generateImages(generationRequest)
    
    console.log(`[${this.jobName.toUpperCase()}] Generated ${result.images.length} images for event: ${event.id}`);
    
    // Ensure at least one image was successfully generated
    if (result.images.length === 0) {
      throw new Error(`No images were successfully generated for calendar event ${event.id}. Check database storage errors.`);
    }
    
    return result;
  }

  private async generateImages(request: GenerationRequest): Promise<{ generation: any, images: any[] }> {
    console.log(`[${this.jobName.toUpperCase()}] Creating image generation record...`);
    
    // Step 1: Create image_generation record
    const generation = await this.createGeneration(request)
    
    // Step 2: Generate prompts based on user's style preferences
    console.log(`[${this.jobName.toUpperCase()}] Generating prompts with user styles: ${request.styles.join(', ')}`);
    const promptResult = await this.generatePromptsWithUserStyles(request)
    
    // Step 3: Generate and store images
    console.log(`[${this.jobName.toUpperCase()}] Processing ${promptResult.prompts.length} prompts for image generation...`);
    const images = await this.processImageGeneration(generation.id, promptResult, request)
    
    // Step 4: Bridge record is no longer needed - calendar_event_id is stored directly in images table
    // The relationship is maintained through the calendar_event_id field in both image_generations and images tables
    
    // Step 5: Update generation record with completion status
    const status = images.length > 0 ? 'completed' : 'failed';
    const errorMessage = images.length === 0 ? 'No images were successfully stored due to database errors' : undefined;
    await this.updateGenerationStatus(generation.id, status, images.map(img => img.id), errorMessage)
    
    return { generation, images }
  }

  private async createGeneration(request: GenerationRequest) {
    const generationData = {
      user_id: request.user_id,
      org_id: request.org_id || null,
      trigger: request.trigger,
      generation_source: request.source,
      style: request.styles[0] || 'Lifestyle + Subject',
      model: 'gpt-image-1',
      status: 'pending',
      calendar_event_id: request.calendar_event_id || null,
      event_summary: request.source === 'calendar' ? request.trigger : null,
      user_style_preferences: request.styles,
      number_of_variations_requested: request.number_of_variations,
      started_at: new Date().toISOString()
    }

    const { data: generation, error } = await this.supabase
      .from('image_generations')
      .insert(generationData)
      .select('id')
      .single()

    if (error) {
      console.error(`[${this.jobName.toUpperCase()}] Error creating image generation:`, error);
      throw error;
    }

    console.log(`[${this.jobName.toUpperCase()}] Created image generation record: ${generation.id}`);
    return generation
  }

  private async generatePromptsWithUserStyles(request: GenerationRequest): Promise<{ prompts: any[], persona: string, products: any[] }> {
    console.log(`[${this.jobName.toUpperCase()}] Generating prompts for: "${request.trigger}"`);
    console.log(`[${this.jobName.toUpperCase()}] User styles: ${JSON.stringify(request.styles)}`);
    
    try {
      // Convert user styles to agent workflow format
      const convertedStyles = request.styles.map(style => this.convertStyleToAgentFormat(style));
      console.log(`[${this.jobName.toUpperCase()}] Converted styles: ${JSON.stringify(convertedStyles)}`);
      
      // Use existing prompt generation with user's style preferences
      const workflowResult = await generateImagePrompts(request.trigger, convertedStyles)
      console.log(`[${this.jobName.toUpperCase()}] Agent workflow completed:`, {
        prompts: workflowResult.prompts.length,
        persona: !!workflowResult.persona,
        products: workflowResult.products.length,
        userStylesUsed: workflowResult.metadata.userStylesUsed
      });
      
      // Filter prompts based on converted user style preferences
      const filteredPrompts = workflowResult.prompts.filter(prompt => 
        convertedStyles.some(convertedStyle => 
          prompt.style === convertedStyle || this.isStyleMatch(prompt.style, convertedStyle)
        )
      )
      
      console.log(`[${this.jobName.toUpperCase()}] Filtered prompts: ${filteredPrompts.length}`);

      // If no matches, ensure we have at least one prompt per user style
      if (filteredPrompts.length === 0) {
        console.log(`[${this.jobName.toUpperCase()}] No matching prompts found, generating custom prompts for each style`);
        const customPrompts = []
        for (const style of request.styles) {
          customPrompts.push({
            style: style,
            variant: {
              prompt: `Generate ${style.toLowerCase()} style image for: ${request.trigger}`,
              scene: `${request.trigger} in ${style.toLowerCase()} style`
            }
          })
        }
        return {
          prompts: customPrompts,
          persona: workflowResult.persona || 'Default persona for custom prompts',
          products: workflowResult.products || []
        }
      }

      // Ensure we have enough prompt variations for the requested number of variations
      const expandedPrompts = []
      for (let i = 0; i < Math.max(request.number_of_variations, 1); i++) {
        expandedPrompts.push(...filteredPrompts)
      }

      console.log(`[${this.jobName.toUpperCase()}] Generated ${expandedPrompts.length} prompt variants`);
      return {
        prompts: expandedPrompts.slice(0, request.number_of_variations * filteredPrompts.length),
        persona: workflowResult.persona || 'Generated persona from agent workflow',
        products: workflowResult.products || []
      }
    } catch (error) {
      console.error(`[${this.jobName.toUpperCase()}] Error generating prompts:`, error);
      throw error;
    }
  }

  private convertStyleToAgentFormat(frontendStyle: string): string {
    // Convert frontend style names to agent workflow format
    const styleConversionMap: Record<string, string> = {
      'Lifestyle no subject': 'lifestyle_no_subject',
      'Lifestyle + Subject': 'lifestyle_with_subject', 
      'Emotionally driven': 'lifestyle_emotional',
      'Studio Style': 'studio',
      'Close-up shot': 'closeup',
      'White background': 'white_background'
    }

    return styleConversionMap[frontendStyle] || frontendStyle.toLowerCase().replace(/\s+/g, '_');
  }

  private isStyleMatch(promptStyle: string, userStyle: string): boolean {
    // Direct match first
    if (promptStyle === userStyle) return true;
    
    const styleMap: Record<string, string[]> = {
      'Lifestyle no subject': ['lifestyle', 'no subject', 'no people', 'lifestyle_no_subject'],
      'Lifestyle + Subject': ['lifestyle', 'with subject', 'lifestyle scene', 'lifestyle_with_subject'],
      'Emotionally driven': ['emotional', 'feeling', 'mood', 'lifestyle_emotional'],
      'Studio Style': ['studio', 'clean', 'professional'],
      'Close-up shot': ['close-up', 'macro', 'detail', 'closeup'],
      'White background': ['white background', 'studio', 'clean', 'white_background']
    }

    const keywords = styleMap[userStyle] || [userStyle.toLowerCase()]
    return keywords.some(keyword => 
      promptStyle.toLowerCase().includes(keyword.toLowerCase())
    )
  }

  private async processImageGeneration(
    generationId: string, 
    promptResult: { prompts: any[], persona: string, products: any[] }, 
    request: GenerationRequest
  ): Promise<any[]> {
    const allImages = []
    const { prompts, persona, products } = promptResult;

    console.log(`[${this.jobName.toUpperCase()}] Starting image generation for ${prompts.length} prompts...`);
    console.log(`[${this.jobName.toUpperCase()}] Persona: ${persona}`);
    console.log(`[${this.jobName.toUpperCase()}] Products: ${products.map(p => p.product_name).join(', ')}`);

    for (const [promptIndex, prompt] of prompts.entries()) {
      if (this.isErrorPrompt(prompt)) {
        console.log(`[${this.jobName.toUpperCase()}] Skipping error prompt ${promptIndex + 1}`);
        continue
      }

      try {
        console.log(`[${this.jobName.toUpperCase()}] Processing prompt ${promptIndex + 1}/${prompts.length}: ${prompt.style}`);
        
        // Generate tags for the prompt
        const tags = await generateTags(prompt.variant.prompt, request.trigger)
        
        // Generate single image for this prompt (variations are handled by having multiple prompts)
        const variations = await this.imageGenerator.generateImages(prompt.variant.prompt, 1)

        console.log(`[${this.jobName.toUpperCase()}] Generated ${variations.length} images for prompt ${promptIndex + 1}`);

        for (const [variationIndex, imageBuffer] of variations.entries()) {
          const filename = `${request.user_id}_${generationId}_${promptIndex}_${variationIndex}.png`
          const publicUrl = await this.storageService.uploadImage(imageBuffer, filename)

          // Generate metadata
          const metadata = {
            calendar_event_id: request.calendar_event_id,
            prompt_index: promptIndex,
            variation_index: variationIndex,
            user_styles: request.styles,
            generation_timestamp: new Date().toISOString(),
            source: request.source
          }

          const { data: imageRecord, error } = await this.supabase
            .from('images')
            .insert({
              generation_id: generationId,
              calendar_event_id: request.calendar_event_id || null,
              storage_url: publicUrl,
              title: this.generateImageTitle(request, prompt.style, variationIndex + 1),
              description: this.generateImageDescription(request, prompt.style),
              tags: tags,
              style_type: prompt.style,
              prompt_used: prompt.variant.prompt,
              model_name: 'gpt-image-1',
              generation_source: request.source,
              generation_metadata: metadata,
              persona: persona, // Store persona from agent workflow
              products: products, // Store products from agent workflow
              prompt_json: {
                full_prompt: prompt.variant,
                style: prompt.style,
                generation_metadata: metadata
              }, // Store complete prompt data
              width: 1024,
              height: 1024,
              format: 'png'
            })
            .select()
            .single()

          if (error) {
            console.error(`[${this.jobName.toUpperCase()}] Error storing image record:`, error);
            continue
          }

          allImages.push(imageRecord)
          console.log(`[${this.jobName.toUpperCase()}] Stored image: ${publicUrl}`);
        }
      } catch (error) {
        console.error(`[${this.jobName.toUpperCase()}] Error generating images for prompt ${promptIndex}:`, error);
      }
    }

    console.log(`[${this.jobName.toUpperCase()}] Image generation completed. Total images: ${allImages.length}`);
    return allImages
  }

  // Note: Bridge table logic removed - relationships are maintained through calendar_event_id in images table

  private async updateGenerationStatus(generationId: string, status: string, imageIds: string[], errorMessage?: string): Promise<void> {
    try {
      await this.supabase
        .from('image_generations')
        .update({
          status: status,
          image_ids: imageIds,
          completed_at: new Date().toISOString(),
          error_message: errorMessage || null
        })
        .eq('id', generationId)

      console.log(`[${this.jobName.toUpperCase()}] Updated generation ${generationId} status to: ${status}`);
    } catch (error) {
      console.error(`[${this.jobName.toUpperCase()}] Error updating generation status:`, error);
    }
  }

  private async updateCalendarEventStatus(
    eventId: string, 
    status: string, 
    errorMessage?: string
  ): Promise<void> {
    try {
      const { data: success } = await this.supabase
        .rpc('update_calendar_event_status', {
          p_event_id: eventId,
          p_status: status,
          p_error_message: errorMessage || null
        })

      if (success) {
        console.log(`[${this.jobName.toUpperCase()}] Updated calendar event ${eventId} status to: ${status}`);
      }
    } catch (error) {
      console.error(`[${this.jobName.toUpperCase()}] Error updating calendar event status:`, error);
    }
  }

  private generateImageTitle(request: GenerationRequest, style: string, variation: number): string {
    const cleanTrigger = request.trigger.split(' ').slice(0, 5).join(' ')
    return `${cleanTrigger} - ${style} (Variation ${variation})`
  }

  private generateImageDescription(request: GenerationRequest, style: string): string {
    return `Generated image for calendar event "${request.trigger}" using ${style} style`
  }

  private isErrorPrompt(prompt: any): boolean {
    const text = prompt.variant?.prompt?.toLowerCase() || ''
    return text.includes('error') || 
           text.includes('no products provided') || 
           text.includes('cannot find products')
  }
}
