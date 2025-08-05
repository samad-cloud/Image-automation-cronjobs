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
      const response = await this.client.models.generateImages({
        model: 'imagen-4.0-generate-preview-06-06',
        prompt,
        config: {
          numberOfImages: count,
        },
      });

      console.log(`[IMAGE-GENERATOR] API response received. Generated ${response.generatedImages?.length || 0} images`);
      const buffers = response.generatedImages.map(
        (img: any) => Buffer.from(img.image.imageBytes, "base64")
      );
      console.log(`[IMAGE-GENERATOR] Converted ${buffers.length} images to buffers`);
      return buffers;
    } catch (error) {
      console.error('[IMAGE-GENERATOR] Error generating images:', error);
      throw error;
    }
  }
}