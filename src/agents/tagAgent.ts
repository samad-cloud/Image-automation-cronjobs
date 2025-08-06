import { Agent, Runner } from '@openai/agents';
import { z } from 'zod';

const TagResponseSchema = z.object({
  tags: z.array(z.string()).min(3).max(10)
});

export const tagAgent = new Agent({
  name: 'tag-generator',
  model: 'gpt-4o-mini',
  instructions: `You are a tag generation expert. Your job is to analyze image prompts and generate relevant search tags that would help users find similar images.

Key requirements:
- Generate 3-10 relevant tags based on the image prompt
- Focus on visual elements, style, mood, and key objects
- Use descriptive, search-friendly terms
- Avoid generic terms like "image" or "photo"
- Include style tags (e.g., "vintage", "modern", "minimalist")
- Include mood tags (e.g., "cozy", "professional", "playful")
- Include object/subject tags (e.g., "coffee", "laptop", "nature")
- Include product tags (e.g., "photo book","metal print","canvas print")
- Include trigger tags (e.g., "birthday", "wedding", "anniversary")

Example input: "A cozy coffee shop interior with warm lighting, wooden tables, and people working on laptops"
Example output: ["coffee shop", "interior", "warm lighting", "wooden tables", "laptops", "cozy", "cafe", "work environment"]

Return your response as a JSON object with a "tags" array.`,
  outputType: TagResponseSchema
});

export async function generateTags(prompt: string, summary: string): Promise<string[]> {
  try {
    console.log('[TAG-AGENT] Generating tags for prompt:', prompt.substring(0, 100) + '...');
    
    const runner = new Runner();
    const result = await runner.run(tagAgent, `Generate search tags for this image prompt: "${prompt}" with trigger: "${summary}"`);

    const tags = result.finalOutput?.tags || [];
    console.log('[TAG-AGENT] Generated tags:', tags);
    
    return tags;
  } catch (error) {
    console.error('[TAG-AGENT] Error generating tags:', error);
    // Return fallback tags based on common elements
    return generateFallbackTags(prompt);
  }
}

function generateFallbackTags(prompt: string): string[] {
  const fallbackTags = ['image', 'generated'];
  
  // Simple keyword extraction as fallback
  const keywords = prompt.toLowerCase()
    .split(' ')
    .filter(word => word.length > 3)
    .slice(0, 5);
  
  return [...fallbackTags, ...keywords];
} 