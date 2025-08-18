// integrated_csv_workflow.ts
// Integrates CSV processing with the existing index.ts flow
// Uses country, product_type, mpn, and size as trigger components

import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { generateImagePrompts } from './index';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

// --- ENV --------------------------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL) throw new Error("Set SUPABASE_URL in env.");
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Set SUPABASE_SERVICE_ROLE_KEY in env.");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// --- INPUTS -----------------------------------------------------------------
const CSV_PATH = process.env.CSV_PATH || "./src/datafeedGB_26195rows_202507301457(in).csv";
const OUTPUT_DIR = process.env.OUTPUT_DIR || "./out_integrated_workflow";
const MAX_RECORDS = Number(process.env.MAX_RECORDS) || 10;

// --- TYPES & CSV ------------------------------------------------------------
type CsvRow = {
  country: string;
  title: string;
  description: string;
  product_type: string;
  mpn: string;
  size?: string;
  brand?: string;
  color?: string;
  [k: string]: any;
};

type IntegratedResult = {
  csvRow: CsvRow;
  trigger: string;
  generatedPrompts: any[];
  timestamp: string;
  processingTime: number;
};

function loadCsv(filePath: string): CsvRow[] {
  const csv = fs.readFileSync(filePath, "utf8");
  const rows = parse(csv, { columns: true, skip_empty_lines: true }) as CsvRow[];
  return rows;
}

// --- TRIGGER CONSTRUCTION ---------------------------------------------------
function buildTriggerFromRow(row: CsvRow): string {
  const { country, product_type, mpn, size, title, description } = row;
  
  // Construct a comprehensive trigger that incorporates all key fields
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

// --- SUPABASE RESULT STORAGE ------------------------------------------------
async function saveResultToSupabase(result: IntegratedResult): Promise<void> {
  try {
    const { error } = await supabase
      .from('integrated_workflow_results')
      .insert({
        country: result.csvRow.country,
        product_type: result.csvRow.product_type,
        mpn: result.csvRow.mpn,
        size: result.csvRow.size,
        title: result.csvRow.title,
        trigger: result.trigger,
        generated_prompts: result.generatedPrompts,
        processing_time: result.processingTime,
        timestamp: result.timestamp,
        csv_row_data: result.csvRow
      });

    if (error) {
      console.error('Error saving to Supabase:', error);
      throw error;
    }

    console.log(`✓ Result saved to Supabase for ${result.csvRow.mpn}`);
  } catch (error) {
    console.error(`Failed to save result for ${result.csvRow.mpn}:`, error);
    // Don't throw - continue processing other rows
  }
}

// --- BATCH PROCESSING -------------------------------------------------------
export async function processCSVWithIntegratedFlow(): Promise<IntegratedResult[]> {
  console.log('🚀 Starting integrated CSV workflow...');
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const rows = loadCsv(CSV_PATH)
    .filter((r) => r?.country && r?.product_type && r?.mpn) // Ensure required fields exist
    .slice(0, MAX_RECORDS);

  console.log(`📊 Processing ${rows.length} rows...`);

  const results: IntegratedResult[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const startTime = Date.now();
    const timestamp = new Date().toISOString();
    
    // Create unique identifier for this row
    const id = row.mpn || `${row.product_type}_${(row.size || "N/A").replace(/\W+/g, "-")}_${i}`;
    const itemDir = path.join(OUTPUT_DIR, String(id));
    fs.mkdirSync(itemDir, { recursive: true });

    try {
      console.log(`\n📝 Processing ${i + 1}/${rows.length}: ${row.title} (${row.mpn})`);
      
      // Build trigger from CSV row data
      const trigger = buildTriggerFromRow(row);
      console.log(`🎯 Trigger: ${trigger.substring(0, 100)}...`);
      
      // Use existing generateImagePrompts function
      console.log('🤖 Generating prompts with existing workflow...');
      const generatedPrompts = await generateImagePrompts(trigger);
      
      const processingTime = (Date.now() - startTime) / 1000;
      
      const result: IntegratedResult = {
        csvRow: row,
        trigger,
        generatedPrompts,
        timestamp,
        processingTime
      };

      // Save result locally
      fs.writeFileSync(
        path.join(itemDir, "integrated_result.json"),
        JSON.stringify(result, null, 2),
        "utf8"
      );

      // Save to Supabase (using existing memory preference [[memory:4926245]])
      await saveResultToSupabase(result);

      results.push(result);
      
      console.log(`✅ ${i + 1}/${rows.length} completed in ${processingTime.toFixed(2)}s`);
      console.log(`   Generated ${generatedPrompts.length} prompt variants`);
      
    } catch (err: any) {
      console.error(`❌ ${i + 1}/${rows.length} failed for ${row.mpn}:`, err?.message || err);
      
      // Save error info
      fs.writeFileSync(
        path.join(itemDir, "error.txt"),
        String(err?.stack || err?.message || err)
      );
      
      // Continue processing other rows
      continue;
    }
  }

  console.log(`\n🎉 Integrated workflow completed!`);
  console.log(`   Processed: ${results.length}/${rows.length} rows successfully`);
  
  return results;
}

// --- SINGLE ROW PROCESSING --------------------------------------------------
export async function processSingleRow(
  country: string, 
  productType: string, 
  mpn: string, 
  size?: string,
  additionalData?: Partial<CsvRow>
): Promise<IntegratedResult> {
  console.log(`🔄 Processing single row: ${country} | ${productType} | ${mpn} | ${size || 'N/A'}`);
  
  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  
  // Create a synthetic CSV row
  const row: CsvRow = {
    country,
    product_type: productType,
    mpn,
    size,
    title: additionalData?.title || `${productType} - ${mpn}`,
    description: additionalData?.description || `High-quality ${productType} product`,
    ...additionalData
  };
  
  const trigger = buildTriggerFromRow(row);
  const generatedPrompts = await generateImagePrompts(trigger);
  const processingTime = (Date.now() - startTime) / 1000;
  
  const result: IntegratedResult = {
    csvRow: row,
    trigger,
    generatedPrompts,
    timestamp,
    processingTime
  };
  
  // Save to Supabase
  await saveResultToSupabase(result);
  
  console.log(`✅ Single row processed in ${processingTime.toFixed(2)}s`);
  return result;
}

// --- MAIN EXECUTION ---------------------------------------------------------
async function main() {
  try {
    // Check if we're running in single-row mode via environment variables
    const singleCountry = process.env.SINGLE_COUNTRY;
    const singleProductType = process.env.SINGLE_PRODUCT_TYPE;
    const singleMPN = process.env.SINGLE_MPN;
    const singleSize = process.env.SINGLE_SIZE;
    
    if (singleCountry && singleProductType && singleMPN) {
      // Single row processing mode
      await processSingleRow(singleCountry, singleProductType, singleMPN, singleSize);
    } else {
      // Batch CSV processing mode
      await processCSVWithIntegratedFlow();
    }
  } catch (error) {
    console.error('💥 Fatal error in integrated workflow:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main();
}
