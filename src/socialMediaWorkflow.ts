import './config';
import { Runner, Agent } from '@openai/agents';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import socialMediaCaptionInstructions from './image_prompt_instructions/social_media_caption';
import socialMediaEnhanceInstructions from './image_prompt_instructions/social_media_enhance';

// Initialize Supabase client with service role key
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Initialize Google AI client
const googleAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!
});

// Zod schema for Social Media Enhanced Prompt
const SocialMediaEnhancedPromptSchema = z.object({
  scene: z.string().describe('A 100-150 word vivid, lifestyle or interior design description'),
  shot_type: z.enum(['wide shot', 'medium shot', 'close up']).describe('Camera shot type'),
  composition: z.string().describe('2-5 words of framing advice'),
  colour_palette: z.string().describe('3-4 descriptive colour words matching country décor trends'),
  aspect_ratio: z.enum(['1:1', '4:5']).describe('Aspect ratio for social media')
});

type SocialMediaEnhancedPrompt = z.infer<typeof SocialMediaEnhancedPromptSchema>;

interface SocialMediaResult {
  caption: string;
  enhancedPrompt: SocialMediaEnhancedPrompt;
  imageUrls: string[];
  timestamp: string;
}

async function generateSocialMediaCaption(sceneDescription: string): Promise<string> {
  console.log('[SOCIAL-MEDIA] Generating caption and tags based on enhanced scene...');
  
  const runner = new Runner();
  const captionAgent = new Agent({
    model: 'gpt-5',
    name: 'Social Media Caption Generator',
    instructions: socialMediaCaptionInstructions,
  });

  const result = await runner.run(captionAgent, sceneDescription);
  const caption = result.finalOutput || 'Caption generation failed';
  
  console.log('[SOCIAL-MEDIA] Generated caption:', caption);
  return caption;
}

async function enhanceSocialMediaPrompt(userPrompt: string): Promise<SocialMediaEnhancedPrompt> {
  console.log('[SOCIAL-MEDIA] Enhancing prompt for image generation...');
  
  const runner = new Runner();
  const enhanceAgent = new Agent({
    name: 'Social Media Prompt Enhancer',
    model: 'gpt-5',
    instructions: socialMediaEnhanceInstructions,
    outputType: SocialMediaEnhancedPromptSchema
  });

  const result = await runner.run(enhanceAgent, userPrompt);
  
  if (!result.finalOutput) {
    throw new Error('Failed to enhance prompt');
  }

  // The outputType with Zod schema automatically validates and parses the output
  const enhancedPrompt = result.finalOutput as SocialMediaEnhancedPrompt;
  
  console.log('[SOCIAL-MEDIA] Enhanced prompt generated:', enhancedPrompt);
  return enhancedPrompt;
}

async function generateImagesWithImagen(enhancedPrompt: SocialMediaEnhancedPrompt): Promise<Buffer[]> {
  console.log('[SOCIAL-MEDIA] Generating images with Gemini Imagen 4...');
  
  const fullPrompt = enhancedPrompt.scene;
  console.log(`[SOCIAL-MEDIA] Using prompt: "${fullPrompt.substring(0, 100)}..."`);

  try {
    const response = await googleAI.models.generateImages({
      model: 'imagen-4.0-generate-preview-06-06',
      prompt: fullPrompt,
      config: {
        numberOfImages: 2, // Generate 2 images for variety
      },
    });

    const buffers: Buffer[] = [];
    
    if (response.generatedImages && response.generatedImages.length > 0) {
      for (const generatedImage of response.generatedImages) {
        if (generatedImage.image?.imageBytes) {
          const buffer = Buffer.from(generatedImage.image.imageBytes, "base64");
          buffers.push(buffer);
        }
      }
    }

    console.log(`[SOCIAL-MEDIA] Generated ${buffers.length} images successfully`);
    return buffers;
  } catch (error) {
    console.error('[SOCIAL-MEDIA] Error generating images with Imagen:', error);
    throw error;
  }
}

async function uploadImagesToSupabase(imageBuffers: Buffer[], timestamp: string): Promise<string[]> {
  console.log('[SOCIAL-MEDIA] Uploading images to Supabase...');
  
  const uploadPromises = imageBuffers.map(async (buffer, index) => {
    const filename = `social-media-${timestamp}-${index + 1}.png`;
    
    const { data, error } = await supabase.storage
      .from('social_media')
      .upload(filename, buffer, {
        contentType: 'image/png',
        duplex: 'half'
      });

    if (error) {
      console.error(`[SOCIAL-MEDIA] Error uploading image ${index + 1}:`, error);
      throw error;
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('social_media')
      .getPublicUrl(filename);

    console.log(`[SOCIAL-MEDIA] Uploaded image ${index + 1}: ${publicUrlData.publicUrl}`);
    return publicUrlData.publicUrl;
  });

  const imageUrls = await Promise.all(uploadPromises);
  console.log(`[SOCIAL-MEDIA] All ${imageUrls.length} images uploaded successfully`);
  return imageUrls;
}

async function saveTempImages(imageBuffers: Buffer[], timestamp: string): Promise<string[]> {
  console.log('[SOCIAL-MEDIA] Saving temporary images locally...');
  
  const tempDir = path.join(process.cwd(), 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const imagePaths: string[] = [];
  
  imageBuffers.forEach((buffer, index) => {
    const filename = `social-media-${timestamp}-${index + 1}.png`;
    const filepath = path.join(tempDir, filename);
    
    fs.writeFileSync(filepath, buffer);
    imagePaths.push(filepath);
    console.log(`[SOCIAL-MEDIA] Saved temp image: ${filepath}`);
  });

  return imagePaths;
}

export async function generateSocialMediaContent(userPrompt: string): Promise<SocialMediaResult> {
  console.log('[SOCIAL-MEDIA] Starting social media content generation...');
  console.log('[SOCIAL-MEDIA] User prompt:', userPrompt);
  
  const startTime = Date.now();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  try {
    // Step 1: Enhance prompt for image generation
    console.log('[SOCIAL-MEDIA] Step 1: Enhancing user prompt for image generation...');
    const enhancedPrompt = await enhanceSocialMediaPrompt(userPrompt);

    // Step 2: Generate caption and tags based on the enhanced prompt
    console.log('[SOCIAL-MEDIA] Step 2: Generating caption and tags based on enhanced scene...');
    const caption = await generateSocialMediaCaption(enhancedPrompt.scene);

    // Step 3: Generate images with Gemini Imagen 4
    console.log('[SOCIAL-MEDIA] Step 3: Generating images with Gemini Imagen 4...');
    const imageBuffers = await generateImagesWithImagen(enhancedPrompt);

    if (imageBuffers.length === 0) {
      throw new Error('No images were generated');
    }

    // Step 4: Upload images to Supabase
    console.log('[SOCIAL-MEDIA] Step 4: Uploading images to Supabase...');
    let imageUrls: string[] = [];
    try {
      imageUrls = await uploadImagesToSupabase(imageBuffers, timestamp);
    } catch (supabaseError) {
      console.warn('[SOCIAL-MEDIA] Supabase upload failed, saving locally instead:', supabaseError);
      const tempPaths = await saveTempImages(imageBuffers, timestamp);
      imageUrls = tempPaths; // Use local paths as fallback
    }

    const totalTime = (Date.now() - startTime) / 1000;
    console.log(`[SOCIAL-MEDIA] Content generation completed in ${totalTime.toFixed(2)} seconds`);

    const result: SocialMediaResult = {
      caption,
      enhancedPrompt,
      imageUrls,
      timestamp
    };

    // Log the complete result
    console.log('\n=== SOCIAL MEDIA CONTENT GENERATED ===');
    console.log('Caption & Tags:');
    console.log(result.caption);
    console.log('\nEnhanced Prompt:', JSON.stringify(result.enhancedPrompt, null, 2));
    console.log('\nGenerated Images:', result.imageUrls.length);
    result.imageUrls.forEach((url, index) => {
      console.log(`  ${index + 1}. ${url}`);
    });
    console.log('=====================================\n');

    return result;

  } catch (error) {
    console.error('[SOCIAL-MEDIA] Error in social media workflow:', error);
    throw error;
  }
}

// CLI interface for standalone execution
async function main() {
  if (process.argv.length < 3) {
    console.log('Usage: npm run social-media "Your prompt here"');
    console.log('Example: npm run social-media "A cozy living room in winter with a family photobook"');
    process.exit(1);
  }

  const userPrompt = process.argv.slice(2).join(' ');
  
  try {
    await generateSocialMediaContent(userPrompt);
  } catch (error) {
    console.error('Social media generation failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}
