-- Add tags column to test_calendar_events table
ALTER TABLE test_calendar_events 
ADD COLUMN tags TEXT[] DEFAULT '{}';

-- Add index for better search performance
CREATE INDEX idx_test_calendar_events_tags ON test_calendar_events USING GIN (tags);

-- Update RLS policy to include tags column
DROP POLICY IF EXISTS "Users can view their own events" ON test_calendar_events;
CREATE POLICY "Users can view their own events" ON test_calendar_events
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own events" ON test_calendar_events;
CREATE POLICY "Users can insert their own events" ON test_calendar_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own events" ON test_calendar_events;
CREATE POLICY "Users can update their own events" ON test_calendar_events
  FOR UPDATE USING (auth.uid() = user_id);

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE ON test_calendar_events TO authenticated; 