-- Migration: Fix persona index size issue
-- Date: 2025-01-18
-- Description: Replace btree index with text index for large persona content

-- 1. Drop the problematic btree index on persona
DROP INDEX IF EXISTS idx_images_persona;

-- 2. Create a text search index instead (for searching within persona content)
CREATE INDEX IF NOT EXISTS idx_images_persona_text ON public.images USING gin (to_tsvector('english', persona));

-- 3. Create a partial index for filtering by persona existence
CREATE INDEX IF NOT EXISTS idx_images_has_persona ON public.images (id) WHERE persona IS NOT NULL;

-- 4. Alternative: Create a hash index for exact persona matches (if needed)
-- CREATE INDEX IF NOT EXISTS idx_images_persona_hash ON public.images USING hash (persona);

-- 5. Add a comment explaining the indexing strategy
COMMENT ON INDEX idx_images_persona_text IS 'Full-text search index for persona content';
COMMENT ON INDEX idx_images_has_persona IS 'Partial index for filtering images with persona data';
