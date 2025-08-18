-- Migration: Reset stuck calendar events that are in processing status
-- Date: 2025-01-18
-- Description: Reset calendar events stuck in 'processing' status back to 'pending' so they can be retried

-- Update calendar events that are stuck in 'processing' status back to 'pending'
-- This will allow them to be picked up by the job processor again
UPDATE public.calendar_events 
SET 
  status = 'pending',
  locked_until = NULL,
  updated_at = NOW()
WHERE 
  status = 'processing'
  AND (locked_until IS NULL OR locked_until < NOW() - INTERVAL '1 hour');

-- Show how many events were reset
SELECT 
  COUNT(*) as events_reset_count,
  'Events reset from processing to pending' as description;
