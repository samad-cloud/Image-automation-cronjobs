import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../../supabase/types';

export class StorageService {
  constructor(private supabase: SupabaseClient<Database>) {}

  async uploadImage(imageBuffer: Buffer, filename: string): Promise<string> {
    try {
      const { data, error } = await this.supabase
        .storage
        .from('image-automation-test')
        .upload(filename, imageBuffer, {
          contentType: 'image/png',
          upsert: true
        });

      if (error) throw error;

      const { data: { publicUrl } } = this.supabase
        .storage
        .from('image-automation-test')
        .getPublicUrl(data.path);

      return publicUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      throw error;
    }
  }
}