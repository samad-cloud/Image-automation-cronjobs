import {GoogleGenAI}  from '@google/genai';

export class ImagenGenerator {
  private client: GoogleGenAI;

  constructor() {
    console.log('[IMAGEN-GENERATOR] Initializing Google AI client...');
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not set');
    }
    this.client = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});
    console.log('[IMAGEN-GENERATOR] Google AI client initialized successfully');
  }

  async generateImages(prompt: string, count: number = 1): Promise<Buffer[]> {
    console.log(`[IMAGEN-GENERATOR] Generating ${count} image(s) with prompt: "${prompt.substring(0, 100)}..."`);
    
    const buffers: Buffer[] = [];
    
    try {
      
      for (let i = 0; i < count; i++) {
        console.log(`[IMAGEN-GENERATOR] Generating image ${i + 1}/${count}...`);
        
        const result = await this.client.models.generateImages({
          model: 'imagen-4.0-generate-preview-06-06',
          prompt: "DO NOT add any detail, just use it AS-IS:" + prompt,
          config: {
            numberOfImages: 1,
          }
        });

        if (result.generatedImages && result.generatedImages.length > 0) {
          const image = result?.generatedImages[0].image;
          if (image?.imageBytes) {
            // Convert the image to buffer
            const buffer = Buffer.from(image.imageBytes, 'base64');
            buffers.push(buffer);
            console.log(`[IMAGEN-GENERATOR] Successfully generated image ${i + 1}`);
          } else {
            console.error(`[IMAGEN-GENERATOR] No image data received for image ${i + 1}`);
          }
        } else {
          console.error(`[IMAGEN-GENERATOR] No images were generated for image ${i + 1}`);
        }
      }
      
      console.log(`[IMAGEN-GENERATOR] Successfully generated ${buffers.length} images`);
      return buffers;
    } catch (error) {
      console.error('[IMAGEN-GENERATOR] Error generating images:', error);
      throw error;
    }
  }
}
