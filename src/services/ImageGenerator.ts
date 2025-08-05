import { GoogleGenerativeAI } from '@google/generative-ai';

export class ImageGenerator {
  private client: any;

  constructor() {
    this.client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  }

  async generateImages(prompt: string, count: number = 1): Promise<Buffer[]> {
    try {
      const model = this.client.getGenerativeModel({ model: 'imagen-4.0-generate-preview-06-06' });
      
      const response = await model.generateImages({
        prompt,
        number_of_images: count,
        aspect_ratio: '16:9',
        safety_filter_level: 'BLOCK_LOW_AND_ABOVE',
        output_mime_type: 'image/png'
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