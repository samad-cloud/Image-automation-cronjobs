# Google SEM Workflow Integration Refactor

## Overview

The Google SEM workflow has been successfully refactored to integrate with the existing `index.ts` flow. Instead of using custom OpenAI agents for prompt generation, it now leverages the comprehensive persona and product classification system already built in `index.ts`.

## Key Changes

### 1. Trigger Format Integration

**Before**: Custom prompts using title, description, and product type
**After**: Structured triggers using country, product type, MPN, and size

The new trigger format follows this structure:
```
Country: [country]
Product Type: [product_type]
MPN: [mpn]
Size: [size]
Title: [title]
Description: [description]
```

### 2. Workflow Integration

**Before**: 
- Custom OpenAI agent (`PromptPair`) for generating lifestyle and white background prompts
- Manual prompt construction with creative briefs

**After**:
- Uses existing `generateImagePrompts()` function from `index.ts`
- Leverages persona classification, product descriptions, and style instructions
- Maintains compatibility with image rendering for backward compatibility

### 3. Files Modified

#### `google_sem_workflow.ts` (Refactored)
- **Removed**: Custom OpenAI agent, manual prompt building, zod schemas
- **Added**: Integration with `generateImagePrompts()`, trigger construction from CSV rows
- **Enhanced**: Better error handling, comprehensive result storage
- **Maintained**: Gemini Imagen 4 rendering, Supabase uploads

#### `integrated_csv_workflow.ts` (New)
- Standalone module for CSV processing with the integrated flow
- Supports both batch processing and single-row processing
- Includes Supabase result storage (following user preference [[memory:4926245]])
- Environment variable support for flexible execution

#### `test_integration.ts` (New)
- Comprehensive test suite for the integrated workflow
- Tests direct triggers, single-row processing, and multiple scenarios
- Validates integration with existing `index.ts` flow

## CSV Data Structure

The workflow now expects CSV files with these required fields:
- `country` - Target country for the product
- `product_type` - Type of product (Canvas, PhotoBook, Mug, etc.)
- `mpn` - Manufacturer Part Number (used as unique identifier)
- `size` - Product dimensions/size
- `title` - Product title
- `description` - Product description

Additional fields are preserved and included in results.

## Usage Examples

### 1. Batch CSV Processing
```bash
# Process CSV file with integrated workflow
npm run ts-node src/google_sem_workflow.ts

# Or use the dedicated integrated workflow
npm run ts-node src/integrated_csv_workflow.ts
```

### 2. Single Row Processing
```bash
# Set environment variables for single-row mode
export SINGLE_COUNTRY="United Kingdom"
export SINGLE_PRODUCT_TYPE="Canvas"
export SINGLE_MPN="CANVAS-20X30-PREMIUM"
export SINGLE_SIZE="20x30 inches"

npm run ts-node src/integrated_csv_workflow.ts
```

### 3. Testing Integration
```bash
npm run ts-node src/test_integration.ts
```

## Environment Variables

Required:
- `GEMINI_API_KEY` - For image generation
- `SUPABASE_URL` - For result storage
- `SUPABASE_SERVICE_ROLE_KEY` - For Supabase authentication

Optional:
- `CSV_PATH` - Path to CSV file (default: "./src/datafeedGB_26195rows_202507301457(in).csv")
- `OUTPUT_DIR` - Output directory (default: "./out_sem_images")
- `MAX_RECORDS` - Maximum records to process (default: 10)

For single-row processing:
- `SINGLE_COUNTRY` - Country for single row
- `SINGLE_PRODUCT_TYPE` - Product type for single row
- `SINGLE_MPN` - MPN for single row
- `SINGLE_SIZE` - Size for single row

## Benefits of Integration

1. **Consistency**: All prompt generation now uses the same underlying system
2. **Enhanced Prompts**: Leverages existing persona classification and product knowledge
3. **Maintainability**: Single source of truth for prompt generation logic
4. **Flexibility**: Supports both the existing creative briefs and new dynamic generation
5. **Scalability**: Can process large CSV files with comprehensive error handling

## Output Structure

Each processed row generates:
```json
{
  "csv_row": { /* Original CSV data */ },
  "trigger": "Formatted trigger used for generation",
  "all_generated_prompts": [ /* All variants from index.ts flow */ ],
  "rendered_prompts": {
    "lifestyle_prompt": "Prompt used for lifestyle image",
    "white_bg_prompt": "Prompt used for white background image"
  },
  "supabase_urls": {
    "lifestyle": "URL of lifestyle image",
    "white_bg": "URL of white background image"
  },
  "local_paths": {
    "lifestyle": "Local path to lifestyle image",
    "white_bg": "Local path to white background image"
  },
  "processing_time": 12.34,
  "timestamp": "2025-01-27T..."
}
```

## Future Enhancements

1. **Style Customization**: Allow CSV to specify preferred styles per row
2. **Country-Specific Styling**: Use country information for localized prompts
3. **Batch Optimization**: Parallel processing for better performance
4. **Result Analytics**: Dashboard for tracking generation success rates
5. **Quality Metrics**: Integration with image quality assessment

## Migration Notes

- The old `google_sem_workflow.ts` is backward compatible but uses the new flow
- Results now include comprehensive prompt variants, not just lifestyle/white_bg
- MPN is now the primary identifier instead of generated IDs
- All results are stored in Supabase following user preferences
