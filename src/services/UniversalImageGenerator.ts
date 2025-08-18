import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { GenerationRequest } from '../../supabase/types'
import { generateImagePrompts } from '../jobs/agentWorkflow'
import { ImageGenerator } from './ImageGenerator'
import { StorageService } from './StorageService'
import { generateTags } from '../agents/tagAgent'

export class UniversalImageGenerator {
  private supabase: SupabaseClient
  private imageGenerator: ImageGenerator
  private storageService: StorageService
  private currentPersona?: string
  private currentProducts?: any[]

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
    this.imageGenerator = new ImageGenerator()
    this.storageService = new StorageService(this.supabase)
  }

  async generateImages(request: GenerationRequest): Promise<{ generation: any, images: any[] }> {
    console.log(`[UNIVERSAL-GENERATOR] Starting ${request.source} generation for user: ${request.user_id}`);
    
    // Step 1: Create image_generation record
    const generation = await this.createGeneration(request)
    
    try {
      // Step 2: Generate prompts based on source
      const prompts = request.source === 'calendar' 
        ? await this.generateFromCalendarEvent(request)
        : await this.generateFromManualRequest(request)
      
      // Step 3: Generate and store images
      const images = await this.processImageGeneration(generation.id, prompts, request)
      
      // Step 4: Create bridge record (only for calendar-driven)
      if (request.source === 'calendar' && request.calendar_event_id) {
        await this.createCalendarBridge(request.calendar_event_id, generation.id, request)
      }
      
      // Step 5: Mark generation as completed
      await this.updateGenerationStatus(generation.id, 'completed', images.map(img => img.id))
      
      console.log(`[UNIVERSAL-GENERATOR] Generated ${images.length} images for ${request.source} request`);
      return { generation, images }
    } catch (error) {
      console.error(`[UNIVERSAL-GENERATOR] Error in generation:`, error);
      
      // Mark generation as failed
      await this.updateGenerationStatus(generation.id, 'failed', [], error instanceof Error ? error.message : 'Unknown error')
      
      throw error
    }
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
      started_at: new Date().toISOString(),
      
      // Calendar-specific fields
      ...(request.source === 'calendar' && {
        calendar_event_id: request.calendar_event_id,
        event_summary: request.trigger,
        user_style_preferences: request.styles,
        number_of_variations_requested: request.number_of_variations
      }),
      
      // Manual-specific fields
      ...(request.source === 'manual' && {
        calendar_event_id: null,
        manual_trigger_data: {
          manual_trigger: request.manual_trigger,
          manual_prompt: request.manual_prompt,
          manual_styles: request.manual_styles,
          manual_variations: request.manual_variations,
          request_timestamp: new Date().toISOString()
        }
      })
    }

    const { data: generation, error } = await this.supabase
      .from('image_generations')
      .insert(generationData)
      .select('id')
      .single()

    if (error) {
      console.error(`[UNIVERSAL-GENERATOR] Error creating image generation:`, error);
      throw error
    }

    return generation
  }

  private async generateFromCalendarEvent(request: GenerationRequest): Promise<any[]> {
    // Get calendar event details if needed
    if (request.calendar_event_id) {
      const { data: event } = await this.supabase
        .from('calendar_events')
        .select('summary, styles, number_of_variations')
        .eq('id', request.calendar_event_id)
        .single()

      if (event) {
        request.styles = event.styles || request.styles
        request.number_of_variations = event.number_of_variations || request.number_of_variations
      }
    }

    // Convert user styles to agent workflow format if needed
    const convertedStyles = request.styles?.map(style => this.convertStyleToAgentFormat(style));
    
    const workflowResult = await generateImagePrompts(request.trigger, convertedStyles)
    
    // Store persona and products for later use in image generation
    this.currentPersona = workflowResult.persona;
    this.currentProducts = workflowResult.products;
    
    return workflowResult.prompts // Return just the prompts array
  }

  private async generateFromManualRequest(request: GenerationRequest): Promise<any[]> {
    // Convert user styles to agent workflow format if needed
    const convertedStyles = request.styles?.map(style => this.convertStyleToAgentFormat(style));
    
    // For manual requests, use the provided trigger and preferences
    const workflowResult = await generateImagePrompts(request.trigger, convertedStyles)
    
    // Store persona and products for later use in image generation
    this.currentPersona = workflowResult.persona;
    this.currentProducts = workflowResult.products;
    
    // Filter prompts based on user's style preferences if provided
    if (request.styles && request.styles.length > 0) {
      const filteredPrompts = workflowResult.prompts.filter(prompt => 
        request.styles!.some((style: string) => this.isStyleMatch(prompt.style, style))
      )
      
      if (filteredPrompts.length > 0) {
        return filteredPrompts
      }
    }
    
    return workflowResult.prompts
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
    const styleMap: Record<string, string[]> = {
      'Lifestyle no subject': ['lifestyle', 'no subject', 'no people'],
      'Lifestyle + Subject': ['lifestyle', 'with subject', 'lifestyle scene'],
      'Emotionally driven': ['emotional', 'feeling', 'mood'],
      'Studio Style': ['studio', 'clean', 'professional'],
      'Close-up shot': ['close-up', 'macro', 'detail'],
      'White background': ['white background', 'studio', 'clean']
    }

    const keywords = styleMap[userStyle] || [userStyle.toLowerCase()]
    return keywords.some(keyword => 
      promptStyle.toLowerCase().includes(keyword.toLowerCase())
    )
  }

  private async processImageGeneration(
    generationId: string, 
    prompts: any[], 
    request: GenerationRequest
  ): Promise<any[]> {
    const allImages = []
    const maxPrompts = Math.min(prompts.length, request.number_of_variations * (request.styles?.length || 1))

    console.log(`[UNIVERSAL-GENERATOR] Processing ${maxPrompts} prompts for generation: ${generationId}`);

    for (const [promptIndex, prompt] of prompts.slice(0, maxPrompts).entries()) {
      if (this.isErrorPrompt(prompt)) continue

      try {
        // Generate tags for the prompt
        const tags = await generateTags(prompt.variant.prompt, request.trigger)
        
        // Generate single image for this prompt
        const variations = await this.imageGenerator.generateImages(prompt.variant.prompt, 1)

        for (const [variationIndex, imageBuffer] of variations.entries()) {
          const filename = `${request.user_id}_${generationId}_${promptIndex}_${variationIndex}.png`
          const publicUrl = await this.storageService.uploadImage(imageBuffer, filename)

          // Generate metadata based on source
          const metadata = request.source === 'calendar' 
            ? {
                calendar_event_id: request.calendar_event_id,
                prompt_index: promptIndex,
                variation_index: variationIndex,
                user_styles: request.styles,
                generation_timestamp: new Date().toISOString()
              }
            : {
                manual_request: request.manual_trigger,
                manual_prompt: request.manual_prompt,
                prompt_index: promptIndex,
                variation_index: variationIndex,
                user_styles: request.styles,
                generation_timestamp: new Date().toISOString()
              }

          const { data: imageRecord, error } = await this.supabase
            .from('images')
            .insert({
              generation_id: generationId,
              calendar_event_id: request.source === 'calendar' ? request.calendar_event_id : null,
              storage_url: publicUrl,
              title: this.generateTitle(request, prompt.style, variationIndex + 1),
              description: this.generateDescription(request, prompt.style),
              tags: tags,
              style_type: prompt.style,
              prompt_used: prompt.variant.prompt,
              model_name: 'gpt-image-1',
              generation_source: request.source,
              generation_metadata: metadata,
              persona: this.currentPersona || null, // Store persona from agent workflow
              products: this.currentProducts || null, // Store products from agent workflow
              prompt_json: {
                full_prompt: prompt.variant,
                style: prompt.style,
                generation_metadata: metadata
              }, // Store complete prompt data
              manual_request_data: request.source === 'manual' ? {
                trigger: request.manual_trigger,
                prompt: request.manual_prompt,
                styles: request.manual_styles,
                variations: request.manual_variations
              } : null,
              width: 1024,
              height: 1024,
              format: 'png'
            })
            .select()
            .single()

          if (error) {
            console.error(`[UNIVERSAL-GENERATOR] Error storing image record:`, error);
            continue
          }

          allImages.push(imageRecord)
        }
      } catch (error) {
        console.error(`[UNIVERSAL-GENERATOR] Error generating images for prompt ${promptIndex}:`, error);
      }
    }

    return allImages
  }

  private async createCalendarBridge(
    calendarEventId: string, 
    generationId: string, 
    request: GenerationRequest
  ): Promise<void> {
    try {
      await this.supabase
        .from('calendar_event_generations')
        .insert({
          calendar_event_id: calendarEventId,
          generation_id: generationId,
          generation_trigger: request.trigger,
          style_preferences: request.styles,
          number_of_variations: request.number_of_variations,
          status: 'completed',
          completed_at: new Date().toISOString()
        })
    } catch (error) {
      console.error(`[UNIVERSAL-GENERATOR] Error creating calendar bridge:`, error);
    }
  }

  private async updateGenerationStatus(
    generationId: string, 
    status: string, 
    imageIds: string[], 
    errorMessage?: string
  ): Promise<void> {
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
    } catch (error) {
      console.error(`[UNIVERSAL-GENERATOR] Error updating generation status:`, error);
    }
  }

  private generateTitle(request: GenerationRequest, style: string, variation: number): string {
    const baseTrigger = request.source === 'calendar' 
      ? request.trigger.split(' ').slice(0, 5).join(' ')
      : request.manual_trigger?.split(' ').slice(0, 5).join(' ') || 'Manual Generation'
    
    return `${baseTrigger} - ${style} (Variation ${variation})`
  }

  private generateDescription(request: GenerationRequest, style: string): string {
    if (request.source === 'calendar') {
      return `Generated image for calendar event "${request.trigger}" using ${style} style`
    } else {
      return `Manually generated image for "${request.manual_trigger || request.trigger}" using ${style} style`
    }
  }

  private isErrorPrompt(prompt: any): boolean {
    const text = prompt.variant?.prompt?.toLowerCase() || ''
    return text.includes('error') || 
           text.includes('no products provided') || 
           text.includes('cannot find products')
  }
}
