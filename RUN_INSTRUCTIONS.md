# How to Run the Integrated CSV Workflow

## Quick Start

### 1. Test the Integration (Recommended First Step)
```bash
cd openai-agents-ts
npm run test:integration
```

This will test the integration without processing actual CSV files or generating images.

### 2. Run the Refactored Google SEM Workflow
```bash
cd openai-agents-ts
npm run google-sem
```

This runs the refactored workflow that now uses your existing `index.ts` flow.

### 3. Run the Standalone Integrated CSV Workflow
```bash
cd openai-agents-ts
npm run integrated-csv
```

This runs the new dedicated integrated workflow.

## Environment Setup

Make sure you have these environment variables set in your `.env` file:

```env
# Required for the existing index.ts flow
OPENAI_API_KEY=your_openai_key_here

# Required for image generation (Google SEM workflow)
GEMINI_API_KEY=your_gemini_key_here

# Required for result storage
SUPABASE_URL=your_supabase_url_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_key_here

# Optional - customize file paths and limits
CSV_PATH=./src/datafeedGB_26195rows_202507301457(in).csv
OUTPUT_DIR=./out_sem_images
MAX_RECORDS=10
```

## Single Row Testing

To test a single product without processing the entire CSV:

```bash
# Windows
set SINGLE_COUNTRY=United Kingdom
set SINGLE_PRODUCT_TYPE=Canvas
set SINGLE_MPN=CANVAS-20X30-PREMIUM
set SINGLE_SIZE=20x30 inches
npm run integrated-csv

# Linux/Mac
export SINGLE_COUNTRY="United Kingdom"
export SINGLE_PRODUCT_TYPE="Canvas"
export SINGLE_MPN="CANVAS-20X30-PREMIUM"
export SINGLE_SIZE="20x30 inches"
npm run integrated-csv
```

## Common Issues & Solutions

### Error: "Unknown file extension .ts"
**Solution**: Use the npm scripts instead of `node` directly:
- ✅ `npm run test:integration`
- ❌ `node src/test_integration.ts`

### Error: "Module not found"
**Solution**: Make sure you're in the `openai-agents-ts` directory and run `npm install`

### Error: Missing environment variables
**Solution**: Create a `.env` file in the `openai-agents-ts` directory with the required variables

## What Each Script Does

| Script | Purpose | Image Generation |
|--------|---------|------------------|
| `test:integration` | Tests integration without images | No |
| `google-sem` | Full workflow with images | Yes (Gemini) |
| `integrated-csv` | Batch CSV processing | No (prompt only) |

## Output Structure

Results are saved to:
- **Local files**: `./out_sem_images/[MPN]/` (or `OUTPUT_DIR`)
- **Supabase**: Automatically uploaded per user preferences
- **Format**: JSON files with comprehensive prompt data and image URLs

## Monitoring Progress

All scripts provide detailed console output showing:
- ✅ Successful processing with timing
- 🎯 Generated triggers
- 🎨 Extracted prompts
- 🖼️ Image generation progress
- ❌ Any errors with details

The integration maintains full backward compatibility while leveraging your existing robust prompt generation system!
