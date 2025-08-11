import OpenAI from 'openai';

export class ImageGenerator {
  private client: OpenAI;

  constructor() {
    console.log('[IMAGE-GENERATOR] Initializing OpenAI client...');
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set');
    }
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    console.log('[IMAGE-GENERATOR] OpenAI client initialized successfully');
  }

  async generateImages(prompt: string, count: number = 1): Promise<Buffer[]> {
    console.log(`[IMAGE-GENERATOR] Generating ${count} image(s) with prompt: "${prompt.substring(0, 100)}..."`);
    
    const buffers: Buffer[] = [];
    
    try {
      // Generate images one by one since OpenAI doesn't support batch generation
        console.log(`[IMAGE-GENERATOR] Generating image ${count}...`);
        
        const result = await this.client.images.generate({
          model: "gpt-image-1",
          prompt: "DO NOT add any detail, just use it AS-IS:" + prompt,
          n:count,
          size: "1536x1024"
        });

        if (result.data && result.data[0] && result.data[0].b64_json) {
          const imageBytes = Buffer.from(result.data[0].b64_json, 'base64');
          buffers.push(imageBytes);
          console.log(`[IMAGE-GENERATOR] Successfully generated image ${count}`);
        } else {
          console.error(`[IMAGE-GENERATOR] No image data received for image`);
        }
        console.log(`[IMAGE-GENERATOR] Successfully generated ${buffers.length} images`);
        return buffers;
      }

        
    catch (error) {
      console.error('[IMAGE-GENERATOR] Error generating images:', error);
      throw error;
    }
  }
}