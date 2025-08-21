import { BaseJob } from './BaseJob'
import { StorageService } from '../services/StorageService'
import { ImageEditService } from '../services/ImageEditService'
import { Database } from '../../supabase/types'

type DbImage = {
  id: string
  thumb_url: string | null
  format: string | null
  generation_id: string | null
  storage_url: string | null
  style_type: string | null
  width?: number | null
  height?: number | null
  generation_metadata?: unknown
  created_at?: string
}

interface PrintAreaConfig {
  [mpn: string]: {
    // Normalized polygon (0-1), clockwise
    polygon?: Array<{ x: number; y: number }>
    // Or a normalized bounding box if polygon not available
    bbox?: { x: number; y: number; width: number; height: number }
  }
}

export class PostProcessJob extends BaseJob {
  private storage: StorageService
  private imageEdit: ImageEditService

  constructor(userId?: string) {
    super('post_process', userId)
    this.storage = new StorageService(this.supabase)
    this.imageEdit = new ImageEditService()
  }

  /**
   * Entry point
   */
  async execute(): Promise<void> {
    await this.startRun()
    try {
      // 1) Find generations that have both lifestyle_emotional and white_background
      const pairs = await this.findCandidatePairs()
      if (pairs.length === 0) {
        console.log('[POST-PROCESS] No candidate pairs found')
        await this.completeRun()
        return
      }

      console.log(`[POST-PROCESS] Found ${pairs.length} generation(s) to sync`)

      for (const pair of pairs) {
        try {
          await this.syncLifestyleWithWhite(pair.white, pair.lifestyle)
        } catch (e) {
          console.error('[POST-PROCESS] Pair failed:', pair.lifestyle?.generation_id, e)
        }
      }

      await this.completeRun()
    } catch (err) {
      await this.completeRun(err as Error)
    }
  }

  private async findCandidatePairs(): Promise<
    Array<{ white: DbImage; lifestyle: DbImage }>
  > {
    // Fetch latest 50 lifestyle images that are not yet synced
    const { data: lifestyleImages, error } = await this.supabase
      .from('images')
      .select('*')
      .eq('style_type', 'lifestyle_emotional')
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('[POST-PROCESS] Query lifestyle images error:', error)
      return []
    }

    const results: Array<{ white: DbImage; lifestyle: DbImage }> = []
    for (const life of lifestyleImages || []) {
      if (!life.generation_id) continue

      // Find matching white_background in same generation
      const { data: white } = await this.supabase
        .from('images')
        .select('*')
        .eq('generation_id', life.generation_id)
        .eq('style_type', 'white_background')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (white && white.storage_url && life.storage_url) {
        results.push({ white, lifestyle: life })
      }
    }
    return results
  }

  private async syncLifestyleWithWhite(white: DbImage, lifestyle: DbImage): Promise<void> {
    console.log('[POST-PROCESS] Sync pair:', {
      generation_id: lifestyle.generation_id,
      white: white.id,
      lifestyle: lifestyle.id
    })

    // Load print-area config by MPN/product if available
    const printAreas = await this.loadPrintAreas()
    const mpn = (lifestyle.generation_metadata as any)?.mpn || (white.generation_metadata as any)?.mpn

    // Prompt-only edit (no mask for now)
    const editedBuffer = await this.imageEdit.replaceWithPromptOnly({
      baseImageUrl: lifestyle.storage_url!,
      donorImageUrl: white.storage_url!,
      generationId: lifestyle.generation_id || lifestyle.id
    })

    // Upload and INSERT as a NEW image row (do not overwrite lifestyle)
    const filename = `google_sem/${lifestyle.id}_synced.png`
    const publicUrl = await this.storage.uploadImage(editedBuffer, filename)

    const newRow: any = {
      generation_id: lifestyle.generation_id,
      storage_url: publicUrl,
      title: (lifestyle as any).title || 'Lifestyle (synced)',
      description: (lifestyle as any).description || null,
      style_type: lifestyle.style_type, // keep same style so they appear together in UI
      model_name: (lifestyle as any).model_name || 'gpt-image-1',
      tags: (lifestyle as any).tags || [],
      generation_status: 'completed',
      prompt_used: 'post-process: synced placeholder from white_background',
      width: lifestyle.width || null,
      height: lifestyle.height || null,
      generation_source: (lifestyle as any).generation_source || null,
      generation_metadata: lifestyle.generation_metadata || null
    }

    const { data: inserted, error: insertError } = await this.supabase
      .from('images')
      .insert(newRow)
      .select()
      .single()

    if (insertError) {
      console.error('[POST-PROCESS] Insert new synced image failed:', insertError)
      return
    }

    console.log('[POST-PROCESS] Inserted new synced image:', inserted?.id)
  }

  private async loadPrintAreas(): Promise<PrintAreaConfig> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const cfg: PrintAreaConfig = require('../utils/printAreas.json')
      return cfg || {}
    } catch {
      return {}
    }
  }
}


