import { SupabaseClient } from '@supabase/supabase-js'
import { ImageData, TagData } from '../../supabase/types'

export interface ImageWithTags {
  url: string
  filename: string
  model: 'gpt-image-1' | 'imagen-4.0-ultra'
  prompt_index: number
  image_index: number
  tags: string[]
  generated_at: string
}

export class ImageDataUtils {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Get all images for a specific event with their tags
   */
  async getImagesWithTags(eventId: string): Promise<ImageWithTags[]> {
    const { data, error } = await this.supabase
      .rpc('get_images_with_tags', { event_id: eventId })

    if (error) {
      console.error('Error fetching images with tags:', error)
      throw error
    }

    return data || []
  }

  /**
   * Get all images for a specific model from an event
   */
  async getImagesByModel(eventId: string, model: 'gpt-image-1' | 'imagen-4.0-ultra') {
    const { data, error } = await this.supabase
      .rpc('get_images_by_model', { 
        event_id: eventId, 
        model_name: model 
      })

    if (error) {
      console.error(`Error fetching ${model} images:`, error)
      throw error
    }

    return data || []
  }

  /**
   * Get tags for a specific image
   */
  async getTagsByImage(
    eventId: string, 
    promptIndex: number, 
    imageIndex: number, 
    model: 'gpt-image-1' | 'imagen-4.0-ultra'
  ): Promise<string[]> {
    const { data, error } = await this.supabase
      .rpc('get_tags_by_image', {
        event_id: eventId,
        prompt_index: promptIndex,
        image_index: imageIndex,
        model_name: model
      })

    if (error) {
      console.error('Error fetching tags for image:', error)
      throw error
    }

    return data || []
  }

  /**
   * Get all images grouped by prompt index
   */
  async getImagesGroupedByPrompt(eventId: string): Promise<Record<number, ImageWithTags[]>> {
    const images = await this.getImagesWithTags(eventId)
    
    const grouped: Record<number, ImageWithTags[]> = {}
    
    for (const image of images) {
      if (!grouped[image.prompt_index]) {
        grouped[image.prompt_index] = []
      }
      grouped[image.prompt_index].push(image)
    }
    
    return grouped
  }

  /**
   * Get all images grouped by model
   */
  async getImagesGroupedByModel(eventId: string): Promise<{
    'gpt-image-1': ImageWithTags[]
    'imagen-4.0-ultra': ImageWithTags[]
  }> {
    const images = await this.getImagesWithTags(eventId)
    
    const grouped = {
      'gpt-image-1': [] as ImageWithTags[],
      'imagen-4.0-ultra': [] as ImageWithTags[]
    }
    
    for (const image of images) {
      grouped[image.model].push(image)
    }
    
    return grouped
  }

  /**
   * Get comparison data for the same prompt across both models
   */
  async getModelComparison(eventId: string): Promise<Record<number, {
    gpt: ImageWithTags | null
    imagen: ImageWithTags | null
  }>> {
    const images = await this.getImagesWithTags(eventId)
    
    const comparison: Record<number, {
      gpt: ImageWithTags | null
      imagen: ImageWithTags | null
    }> = {}
    
    for (const image of images) {
      if (!comparison[image.prompt_index]) {
        comparison[image.prompt_index] = { gpt: null, imagen: null }
      }
      
      if (image.model === 'gpt-image-1') {
        comparison[image.prompt_index].gpt = image
      } else if (image.model === 'imagen-4.0-ultra') {
        comparison[image.prompt_index].imagen = image
      }
    }
    
    return comparison
  }

  /**
   * Get statistics about image generation for an event
   */
  async getEventStats(eventId: string): Promise<{
    total_images: number
    gpt_images: number
    imagen_images: number
    total_prompts: number
    models_used: string[]
  }> {
    const images = await this.getImagesWithTags(eventId)
    
    const gptCount = images.filter(img => img.model === 'gpt-image-1').length
    const imagenCount = images.filter(img => img.model === 'imagen-4.0-ultra').length
    const uniquePrompts = new Set(images.map(img => img.prompt_index)).size
    const modelsUsed = [...new Set(images.map(img => img.model))]
    
    return {
      total_images: images.length,
      gpt_images: gptCount,
      imagen_images: imagenCount,
      total_prompts: uniquePrompts,
      models_used: modelsUsed
    }
  }
}
