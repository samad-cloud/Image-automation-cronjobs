import { genai } from '@google/generative-ai';
import { GenerateImagesConfig } from '@google/generative-ai/dist/types/index';

export class ImageGenerator {
  private client: any;

  constructor() {
    this.client = new genai.Client({ apiKey: process.env.GEMINI_API_KEY! });
  }

  async generateImages(prompt: string, count: number = 1): Promise<Buffer[]> {
    try {
      const response = await this.client.models.generateImages({
        model: 'imagen-3.0-generate-002',
        prompt,
        config: {
          number_of_images: count,
          aspect_ratio: '16:9',
          safety_filter_level: 'BLOCK_LOW_AND_ABOVE',
          output_mime_type: 'image/png'
        } as GenerateImagesConfig
      });

      return response.generated_images.map(
        (img: any) => Buffer.from(img.image.image_bytes)
      );
    } catch (error) {
      console.error('Error generating images:', error);
      throw error;
    }
  }
}