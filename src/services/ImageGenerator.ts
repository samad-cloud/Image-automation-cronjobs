import { GoogleGenAI } from '@google/genai';

export class ImageGenerator {
  private client: any;

  constructor() {
    console.log('[IMAGE-GENERATOR] Initializing Gemini client...');
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not set');
    }
    this.client = new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY!});
    console.log('[IMAGE-GENERATOR] Gemini client initialized successfully');
  }

  async generateImages(prompt: string, count: number = 1): Promise<Buffer[]> {
    console.log(`[IMAGE-GENERATOR] Generating ${count} image(s) with prompt: "${prompt.substring(0, 100)}..."`);
    try {
      // Use the correct Gemini API for image generation
      const response = await this.client.models.generate_images({
        model: 'imagen-4.0-generate-preview-06-06',
        prompt,
        number_of_images: count,
        aspect_ratio: '16:9',
        safety_filter_level: 'BLOCK_LOW_AND_ABOVE',
        output_mime_type: 'image/png'
      });

      console.log(`[IMAGE-GENERATOR] API response received. Generated ${response.generated_images?.length || 0} images`);
      const buffers = response.generated_images.map(
        (img: any) => Buffer.from(img.image.image_bytes)
      );
      console.log(`[IMAGE-GENERATOR] Converted ${buffers.length} images to buffers`);
      return buffers;
    } catch (error) {
      console.error('[IMAGE-GENERATOR] Error generating images:', error);
      throw error;
    }
  }
}