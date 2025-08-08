-- Create helper functions for the new structured image and tag data

-- Create a function to get images by model
CREATE OR REPLACE FUNCTION get_images_by_model(event_id UUID, model_name TEXT)
RETURNS TABLE (
  url TEXT,
  filename TEXT,
  prompt_index INTEGER,
  image_index INTEGER,
  generated_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (img->>'url')::TEXT as url,
    (img->>'filename')::TEXT as filename,
    (img->>'prompt_index')::INTEGER as prompt_index,
    (img->>'image_index')::INTEGER as image_index,
    (img->>'generated_at')::TIMESTAMP WITH TIME ZONE as generated_at
  FROM public.test_calendar_events e,
       jsonb_array_elements(e.image_data) as img
  WHERE e.id = event_id 
    AND (img->>'model')::TEXT = model_name;
END;
$$ LANGUAGE plpgsql;

-- Create a function to get tags by image
CREATE OR REPLACE FUNCTION get_tags_by_image(event_id UUID, prompt_index INTEGER, image_index INTEGER, model_name TEXT)
RETURNS TEXT[] AS $$
DECLARE
  result_tags TEXT[];
BEGIN
  SELECT (tag->>'tags')::TEXT[] INTO result_tags
  FROM public.test_calendar_events e,
       jsonb_array_elements(e.tag_data) as tag
  WHERE e.id = event_id 
    AND (tag->>'prompt_index')::INTEGER = prompt_index
    AND (tag->>'image_index')::INTEGER = image_index
    AND (tag->>'model')::TEXT = model_name;
  
  RETURN result_tags;
END;
$$ LANGUAGE plpgsql;

-- Create a function to get all images with their tags
CREATE OR REPLACE FUNCTION get_images_with_tags(event_id UUID)
RETURNS TABLE (
  url TEXT,
  filename TEXT,
  model TEXT,
  prompt_index INTEGER,
  image_index INTEGER,
  tags TEXT[],
  generated_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (img->>'url')::TEXT as url,
    (img->>'filename')::TEXT as filename,
    (img->>'model')::TEXT as model,
    (img->>'prompt_index')::INTEGER as prompt_index,
    (img->>'image_index')::INTEGER as image_index,
    get_tags_by_image(event_id, 
                     (img->>'prompt_index')::INTEGER, 
                     (img->>'image_index')::INTEGER, 
                     (img->>'model')::TEXT) as tags,
    (img->>'generated_at')::TIMESTAMP WITH TIME ZONE as generated_at
  FROM public.test_calendar_events e,
       jsonb_array_elements(e.image_data) as img
  WHERE e.id = event_id;
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON FUNCTION get_images_by_model IS 'Get all images for a specific model from an event';
COMMENT ON FUNCTION get_tags_by_image IS 'Get tags for a specific image by prompt_index, image_index, and model';
COMMENT ON FUNCTION get_images_with_tags IS 'Get all images with their associated tags for an event';
