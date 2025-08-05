import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../../supabase/types';

export class StorageService {
  constructor(private supabase: SupabaseClient<Database>) {
    console.log('[STORAGE-SERVICE] Storage service initialized');
  }

  async uploadImage(imageBuffer: Buffer, filename: string): Promise<string> {
    console.log(`[STORAGE-SERVICE] Uploading image: ${filename} (${imageBuffer.length} bytes)`);
    try {
      const { data, error } = await this.supabase
        .storage
        .from('image-automation-test')
        .upload(filename, imageBuffer, {
          contentType: 'image/png',
          upsert: true
        });

      if (error) {
        console.error('[STORAGE-SERVICE] Upload error:', error);
        throw error;
      }

      console.log(`[STORAGE-SERVICE] File uploaded successfully. Path: ${data.path}`);
      const { data: { publicUrl } } = this.supabase
        .storage
        .from('image-automation-test')
        .getPublicUrl(data.path);

      console.log(`[STORAGE-SERVICE] Public URL generated: ${publicUrl}`);
      return publicUrl;
    } catch (error) {
      console.error('[STORAGE-SERVICE] Error uploading image:', error);
      throw error;
    }
  }
}