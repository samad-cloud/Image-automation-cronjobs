# Social Media Content Generator

This tool generates complete social media content including Instagram captions, hashtags, and high-quality images using OpenAI agents and Google's Gemini Imagen 4 model.

## Features

- **Caption Generation**: Creates engaging Instagram captions with strategic hashtags using the `social_media_caption` agent
- **Prompt Enhancement**: Transforms user input into detailed visual prompts using the `social_media_enhance` agent  
- **Image Generation**: Creates high-quality images using Google's Imagen 4 model
- **Cloud Storage**: Automatically uploads images to Supabase storage bucket
- **Fallback Storage**: Saves images locally if cloud upload fails

## Prerequisites

Make sure you have the following environment variables set:

```bash
# OpenAI API (for agents)
OPENAI_API_KEY=your_openai_api_key

# Google Gemini API (for image generation)
GEMINI_API_KEY=your_gemini_api_key

# Supabase (for image storage)
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## Usage

### Interactive Mode
```bash
npm run social-media
```

This will prompt you to enter a social media scenario and generate complete content.

### Programmatic Usage

```typescript
import { generateSocialMediaContent } from './src/socialMediaWorkflow';

const result = await generateSocialMediaContent(
  "A cozy living room in winter with a family photobook on the coffee table"
);

console.log('Caption:', result.caption);
console.log('Enhanced Prompt:', result.enhancedPrompt);
console.log('Image URLs:', result.imageUrls);
```

## Example Input/Output

### Input
```
"A stylish Amsterdam loft in spring featuring a wall canvas"
```

### Output

**Caption & Tags:**
```
Transform your favorite memories into stunning wall art that tells your story. This canvas brings warmth and personality to any space, making your house feel like home ✨

#printerpix #wallcanvas #homedecor #amsterdam #springvibes #homedesign #memories #wallart #interiordesign #familymoments #canvasprint
```

**Enhanced Prompt (JSON):**
```json
{
  "scene": "In a sunlit Amsterdam loft, soft urban reflections dance across painted wood floors. Floor-to-ceiling windows frame the canal below, while a cluster of tulips in a Delft blue vase rests on a minimalist oak console. Above a caramel-toned leather sofa, three framed wall canvases create a gallery moment — each showing the same sweeping black-and-white portrait of the loft's owners laughing together on a nearby bridge...",
  "shot_type": "wide shot",
  "composition": "leading lines", 
  "colour_palette": "soft grey, mustard yellow, Delft blue, cream",
  "aspect_ratio": "1:1"
}
```

**Generated Images:**
- 2 high-quality images uploaded to Supabase storage
- Public URLs returned for immediate use

## Workflow Steps

1. **Caption Generation**: Uses OpenAI agent with `social_media_caption` instructions to create engaging captions and hashtags
2. **Prompt Enhancement**: Uses OpenAI agent with `social_media_enhance` instructions to create detailed visual prompts
3. **Image Generation**: Sends enhanced prompt to Google Imagen 4 to generate 2 high-quality images
4. **Image Storage**: Uploads generated images to Supabase storage bucket with public URLs
5. **Result Compilation**: Returns complete social media package ready for posting

## Error Handling

- **Supabase Upload Failure**: Images are saved locally as fallback
- **Image Generation Failure**: Detailed error messages with troubleshooting tips
- **Agent Failure**: Graceful error handling with informative messages

## Storage Structure

Images are stored in Supabase with the naming pattern:
```
social-media-{timestamp}-{index}.png
```

For example:
```
social-media-2024-01-15T10-30-00-000Z-1.png
social-media-2024-01-15T10-30-00-000Z-2.png
```

## Troubleshooting

### Common Issues

1. **"GEMINI_API_KEY is not set"**
   - Make sure your Google AI API key is properly configured
   - Verify you have sufficient Gemini API credits

2. **"Missing SUPABASE credentials"** 
   - Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set
   - Check that your Supabase project has an 'images' storage bucket

3. **"No images were generated"**
   - Check your Gemini API quota and billing
   - Verify the prompt enhancement step completed successfully

### Local Development

For testing without Supabase, images will automatically be saved to a local `temp/` directory if cloud upload fails.

## API Costs

- **OpenAI**: 2 agent calls per generation (caption + enhance)
- **Google Imagen 4**: 2 image generations per prompt
- **Supabase**: Storage and bandwidth costs for uploaded images

## Dependencies

- `@openai/agents`: OpenAI agent framework
- `@google/genai`: Google Generative AI SDK
- `@supabase/supabase-js`: Supabase client
- Environment variable management via `dotenv`
