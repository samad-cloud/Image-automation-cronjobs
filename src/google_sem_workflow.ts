// google_sem_workflow.ts
// REFACTORED: Now uses the existing index.ts flow for prompt generation
// Integrates CSV processing with country, product_type, mpn, and size as trigger components
// Still includes image rendering with Gemini Imagen 4 for backward compatibility

import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { PersonGeneration } from "@google/genai";
import { generateImagePrompts } from './index';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
import { GoogleGenAI } from "@google/genai";

// --- ENV --------------------------------------------------------------------
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!GEMINI_API_KEY) throw new Error("Set GEMINI_API_KEY in env.");
if (!SUPABASE_URL) throw new Error("Set SUPABASE_URL in env.");
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Set SUPABASE_SERVICE_ROLE_KEY in env.");

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// --- INPUTS -----------------------------------------------------------------
const CSV_PATH = process.env.CSV_PATH || "./src/datafeedGB_26195rows_202507301457(in).csv";
const OUTPUT_DIR = process.env.OUTPUT_DIR || "./out_sem_images";
const MAX_RECORDS = Number(10);

// You said this exists in your codebase; import from your module:
import google_sem_creative_breifs from "./image_prompt_instructions/google_sem_creative_breifs"; // <-- adjust path

const product_brief_mapping: Record<string, any> = {
  Blanket: google_sem_creative_breifs.photo_blanket,
  Calendar: google_sem_creative_breifs.wall_calendar,
  Canvas: google_sem_creative_breifs.canvas,
  PhotoBook: google_sem_creative_breifs.photo_book,
  Mug: google_sem_creative_breifs.photo_mug,
  Cushion: google_sem_creative_breifs.cushion,
  LabPrint: google_sem_creative_breifs.photo_print,
  GreetingCard: google_sem_creative_breifs.greeting_card,
};

// --- TYPES & CSV ------------------------------------------------------------
type Row = {
  country: string;
  title: string;
  description: string;
  product_type: string;
  mpn: string;
  size?: string;
  [k: string]: any;
};

function loadCsv(filePath: string): Row[] {
  const csv = fs.readFileSync(filePath, "utf8");
  const rows = parse(csv, { columns: true, skip_empty_lines: true }) as Row[];
  return rows;
}

// --- TRIGGER CONSTRUCTION (NEW APPROACH) -----------------------------------
function buildTriggerFromRow(row: Row): string {
  const { country, product_type, mpn, size, title, description } = row;
  
  // Construct trigger using country, product_type, mpn, and size as requested
  const trigger = [
    `Country: ${country}`,
    `Product Type: ${product_type}`,
    `MPN: ${mpn}`,
    `Size: ${size || 'N/A'}`,
    `Title: ${title}`,
    `Description: ${description}`
  ].join('\n');
  
  return trigger;
}

// Person policy helper unchanged
function allowPeopleFor(productType: string, shot: "lifestyle" | "white_bg") {
  if (shot === "white_bg") return "dont_allow" as const;
  if (/(LabPrint|Canvas|PhotoBook)/i.test(productType)) return "dont_allow" as const;
  return "allow_adult" as const;
}

// --- PROMPT GENERATION (NEW APPROACH using index.ts flow) ------------------
// Instead of using custom OpenAI agents, we now use the existing generateImagePrompts function
// This provides consistency with the existing workflow and leverages all existing persona/product logic

async function generatePromptsFromRow(row: Row): Promise<any[]> {
  const trigger = buildTriggerFromRow(row);
  console.log(`🎯 Generated trigger for ${row.mpn}: ${trigger.substring(0, 100)}...`);
  
  try {
    const generatedPrompts = await generateImagePrompts(trigger);
    console.log(`✅ Generated ${generatedPrompts.length} prompt variants for ${row.mpn}`);
    return generatedPrompts;
  } catch (error) {
    console.error(`❌ Failed to generate prompts for ${row.mpn}:`, error);
    throw error;
  }
}

// Helper function to extract specific prompt styles for compatibility with image rendering
function extractPromptsForRendering(generatedPrompts: any[], row: Row): { lifestyle_prompt: string; white_bg_prompt: string } {
  // Try to find lifestyle and studio prompts from the generated variants
  const lifestyleVariant = generatedPrompts.find(p => 
    p.style.includes('lifestyle') || p.style.includes('emotional')
  );
  const studioVariant = generatedPrompts.find(p => 
    p.style.includes('studio') || p.style.includes('white')
  );
  
  // Fallback: use the first available prompt and modify for white background
  const basePrompt = lifestyleVariant?.variant?.scene || generatedPrompts[0]?.variant?.scene || `High-quality ${row.product_type} product image`;
  
  const lifestyle_prompt = ensureSizeInPrompt(basePrompt, row.size);
  const white_bg_prompt = ensureSizeInPrompt(
    studioVariant?.variant?.scene || `${basePrompt} on PURE WHITE background (#FFFFFF), studio lighting, product photography`,
    row.size
  );
  
  return { lifestyle_prompt, white_bg_prompt };
}

// Post-condition: if size text somehow isn't present, append it safely
function ensureSizeInPrompt(prompt: string, size?: string) {
  const sz = size?.trim();
  if (!sz) return prompt.includes("size:") ? prompt : `${prompt}\nsize: N/A`;
  const normalized = (s: string) => s.toLowerCase().replace(/\s+/g, "");
  if (normalized(prompt).includes(normalized(sz))) return prompt;
  return `${prompt}\nsize: ${sz}`;
}

// --- SUPABASE UPLOAD --------------------------------------------------------
async function uploadImageToSupabase(
  imageBuffer: Buffer, 
  filename: string
): Promise<string> {
  try {
    const { data, error } = await supabase.storage
      .from('google_sem')
      .upload(filename, imageBuffer, {
        contentType: 'image/png',
        duplex: 'half'
      });

    if (error) {
      console.error(`Error uploading ${filename} to Supabase:`, error);
      throw error;
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('google_sem')
      .getPublicUrl(filename);

    console.log(`✓ Uploaded to Supabase: ${publicUrlData.publicUrl}`);
    return publicUrlData.publicUrl;
  } catch (error) {
    console.error(`Failed to upload ${filename}:`, error);
    throw error;
  }
}

// --- GEMINI IMAGEN 4 CALL ---------------------------------------------------
async function renderWithImagen(params: {
  prompt: string;
  personPolicy: PersonGeneration;
  outPathPng: string;
  supabaseFilename: string;
}): Promise<{ localPath: string; supabaseUrl: string }> {
  const { prompt, personPolicy, outPathPng, supabaseFilename } = params;

  const resp = await ai.models.generateImages({
    model: "imagen-4.0-generate-preview-06-06",
    prompt,
    // FORCE 1:1 ASPECT RATIO
    config: {
      numberOfImages: 1,
      aspectRatio: "1:1", // <--- always square
      personGeneration: params.personPolicy,
    },
  });

  const img = resp.generatedImages?.[0]?.image?.imageBytes;
  if (!img) throw new Error("Imagen returned no image bytes.");
  const buf = Buffer.from(img, "base64");
  
  // Save locally for backup/debugging
  fs.writeFileSync(outPathPng, buf);
  
  // Upload to Supabase
  const supabaseUrl = await uploadImageToSupabase(buf, supabaseFilename);
  
  return {
    localPath: outPathPng,
    supabaseUrl
  };
}

// --- MAIN (REFACTORED to use index.ts flow) --------------------------------
async function main() {
  console.log('🚀 Starting refactored Google SEM workflow with integrated index.ts flow...');
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const rows = loadCsv(CSV_PATH)
    .filter((r) => r?.country && r?.product_type && r?.mpn) // Updated filter criteria
    .slice(0, MAX_RECORDS);

  console.log(`📊 Processing ${rows.length} rows with integrated workflow...`);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const startTime = Date.now();
    
    // Use MPN as primary ID, with fallback
    const id = row.mpn || row.id || row.sku || `${row.product_type}_${(row.size || "N/A").replace(/\W+/g, "-")}_${i}`;
    const itemDir = path.join(OUTPUT_DIR, String(id));
    fs.mkdirSync(itemDir, { recursive: true });

    try {
      console.log(`\n📝 Processing ${i + 1}/${rows.length}: ${row.title} (${row.country} | ${row.product_type} | ${row.mpn})`);
      
      // 1) Generate prompts using the existing index.ts flow
      const generatedPrompts = await generatePromptsFromRow(row);
      
      // 2) Extract lifestyle and white background prompts for image rendering
      const { lifestyle_prompt, white_bg_prompt } = extractPromptsForRendering(generatedPrompts, row);
      
      console.log(`🎨 Extracted prompts:`);
      console.log(`   Lifestyle: ${lifestyle_prompt.substring(0, 100)}...`);
      console.log(`   White BG: ${white_bg_prompt.substring(0, 100)}...`);

      // 3) Render lifestyle (1:1) and upload to Supabase
      console.log(`🖼️ Rendering lifestyle image...`);
      const lifestyleResult = await renderWithImagen({
        prompt: lifestyle_prompt,
        personPolicy: PersonGeneration.ALLOW_ADULT,
        outPathPng: path.join(itemDir, "lifestyle.png"),
        supabaseFilename: `${id}_lifestyle.png`,
      });

      // 4) Render white background (1:1, no people) and upload to Supabase
      console.log(`🖼️ Rendering white background image...`);
      const whiteBgResult = await renderWithImagen({
        prompt: white_bg_prompt,
        personPolicy: PersonGeneration.DONT_ALLOW,
        outPathPng: path.join(itemDir, "white_bg.png"),
        supabaseFilename: `${id}_white_bg.png`,
      });

      const processingTime = (Date.now() - startTime) / 1000;

      // 5) Persist comprehensive results including all generated prompts
      const results = {
        csv_row: row,
        trigger: buildTriggerFromRow(row),
        all_generated_prompts: generatedPrompts, // All prompts from index.ts flow
        rendered_prompts: { lifestyle_prompt, white_bg_prompt }, // Specific prompts used for rendering
        supabase_urls: {
          lifestyle: lifestyleResult.supabaseUrl,
          white_bg: whiteBgResult.supabaseUrl
        },
        local_paths: {
          lifestyle: lifestyleResult.localPath,
          white_bg: whiteBgResult.localPath
        },
        processing_time: processingTime,
        timestamp: new Date().toISOString()
      };
      
      fs.writeFileSync(
        path.join(itemDir, "results.json"),
        JSON.stringify(results, null, 2),
        "utf8"
      );

      console.log(`✅ ${i + 1}/${rows.length} completed in ${processingTime.toFixed(2)}s → ${itemDir}`);
      console.log(`   Generated ${generatedPrompts.length} prompt variants`);
      console.log(`   Lifestyle: ${lifestyleResult.supabaseUrl}`);
      console.log(`   White BG: ${whiteBgResult.supabaseUrl}`);
      
    } catch (err: any) {
      console.error(`❌ ${i + 1}/${rows.length} failed for ${row.mpn}:`, err?.message || err);
      fs.writeFileSync(
        path.join(itemDir, "error.txt"),
        String(err?.stack || err?.message || err)
      );
      // Continue processing other rows
      continue;
    }
  }

  console.log("🎉 Refactored Google SEM workflow completed!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
