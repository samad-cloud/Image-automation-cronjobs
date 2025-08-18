-- Migration: Move persona, products, and prompt_json from image_generations to images table
-- Date: 2025-01-18
-- Description: Moves generation-level data to image-level for better granularity

-- 1. Add new columns to images table
ALTER TABLE public.images ADD COLUMN IF NOT EXISTS persona TEXT;
ALTER TABLE public.images ADD COLUMN IF NOT EXISTS products JSONB;
ALTER TABLE public.images ADD COLUMN IF NOT EXISTS prompt_json JSONB;

-- 2. Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_images_persona ON public.images USING btree (persona);
CREATE INDEX IF NOT EXISTS idx_images_products ON public.images USING gin (products);
CREATE INDEX IF NOT EXISTS idx_images_prompt_json ON public.images USING gin (prompt_json);

-- 3. Remove unused columns from image_generations table
-- (We'll keep them for now and mark them as deprecated in comments)
COMMENT ON COLUMN public.image_generations.persona IS 'DEPRECATED: Moved to images table for better granularity';
COMMENT ON COLUMN public.image_generations.products IS 'DEPRECATED: Moved to images table for better granularity';  
COMMENT ON COLUMN public.image_generations.prompt_json IS 'DEPRECATED: Moved to images table for better granularity';

-- 4. Update the images table description
COMMENT ON TABLE public.images IS 'Individual generated images with their specific prompt data, persona context, and product information';
