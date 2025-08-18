-- Multi-User Job Management Functions
-- Run this in your Supabase SQL editor

-- 1. Function to claim next calendar event for processing
CREATE OR REPLACE FUNCTION claim_next_calendar_event(
    p_worker_id TEXT,
    p_timeout_minutes INTEGER DEFAULT 15,
    p_user_id UUID DEFAULT NULL
)
RETURNS TABLE(
    id UUID,
    user_id UUID,
    summary TEXT,
    description TEXT,
    styles JSONB,
    number_of_variations INTEGER,
    trigger_start TIMESTAMP WITH TIME ZONE,
    trigger_end TIMESTAMP WITH TIME ZONE
) 
LANGUAGE plpgsql
AS $$
DECLARE
    event_record RECORD;
BEGIN
    -- Lock and claim the next pending event
    SELECT ce.id, ce.user_id, ce.summary, ce.description, 
           ce.styles, ce.number_of_variations, 
           ce.trigger_start, ce.trigger_end
    INTO event_record
    FROM calendar_events ce
    WHERE ce.status = 'pending'
      AND (p_user_id IS NULL OR ce.user_id = p_user_id)
      AND (ce.locked_until IS NULL OR ce.locked_until < NOW())
      AND ce.trigger_start <= NOW() -- Only process events that should trigger now or in the past
    ORDER BY ce.trigger_start ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    -- Update the event to mark it as processing
    UPDATE calendar_events 
    SET 
        status = 'processing',
        locked_until = NOW() + (p_timeout_minutes || ' minutes')::INTERVAL,
        updated_at = NOW()
    WHERE id = event_record.id;

    -- Return the claimed event
    RETURN QUERY SELECT 
        event_record.id,
        event_record.user_id,
        event_record.summary,
        event_record.description,
        event_record.styles,
        event_record.number_of_variations,
        event_record.trigger_start,
        event_record.trigger_end;
END;
$$;

-- 2. Function to get all users with active Jira integrations
CREATE OR REPLACE FUNCTION get_active_jira_users()
RETURNS TABLE(
    user_id UUID,
    jira_config JSONB,
    last_synced DATE
) 
LANGUAGE sql
AS $$
    SELECT 
        ei.user_id,
        ei.config as jira_config,
        ei.last_synced
    FROM external_integrations ei
    JOIN users u ON ei.user_id = u.id
    WHERE ei.type = 'JIRA'
    AND ei.config IS NOT NULL
    AND ei.config->>'domain' IS NOT NULL
    AND ei.config->>'username' IS NOT NULL
    AND ei.config->>'apiKey' IS NOT NULL;
$$;

-- 3. Function to update calendar event processing status
CREATE OR REPLACE FUNCTION update_calendar_event_status(
    p_event_id UUID,
    p_status TEXT,
    p_error_message TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE calendar_events 
    SET 
        status = p_status,
        locked_until = NULL,
        updated_at = NOW(),
        -- Add error handling if needed
        raw_data = CASE 
            WHEN p_error_message IS NOT NULL THEN 
                COALESCE(raw_data, '{}'::jsonb) || jsonb_build_object('error', p_error_message)
            ELSE raw_data
        END
    WHERE id = p_event_id;
    
    RETURN FOUND;
END;
$$;

-- 4. Function to create user job instance tracking
CREATE TABLE IF NOT EXISTS user_job_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    job_type TEXT NOT NULL CHECK (job_type IN ('jira-fetch', 'event-process')),
    instance_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'stopped', 'error')),
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(user_id, job_type, instance_id)
);

-- Create indexes for job instance tracking
CREATE INDEX IF NOT EXISTS idx_user_job_instances_user_id ON user_job_instances USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_user_job_instances_job_type ON user_job_instances USING btree (job_type);
CREATE INDEX IF NOT EXISTS idx_user_job_instances_status ON user_job_instances USING btree (status);

-- 5. Function to register job instance
CREATE OR REPLACE FUNCTION register_job_instance(
    p_user_id UUID,
    p_job_type TEXT,
    p_instance_id TEXT
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    instance_record_id UUID;
BEGIN
    INSERT INTO user_job_instances (user_id, job_type, instance_id, status)
    VALUES (p_user_id, p_job_type, p_instance_id, 'running')
    ON CONFLICT (user_id, job_type, instance_id) 
    DO UPDATE SET 
        status = 'running',
        last_activity = NOW(),
        error_message = NULL
    RETURNING id INTO instance_record_id;
    
    RETURN instance_record_id;
END;
$$;

-- 6. Function to update job instance activity
CREATE OR REPLACE FUNCTION update_job_instance_activity(
    p_instance_id TEXT,
    p_status TEXT DEFAULT 'running',
    p_error_message TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE user_job_instances 
    SET 
        last_activity = NOW(),
        status = p_status,
        error_message = p_error_message
    WHERE instance_id = p_instance_id;
    
    RETURN FOUND;
END;
$$;

-- 7. Function to clean up stale job instances
CREATE OR REPLACE FUNCTION cleanup_stale_job_instances(
    p_timeout_minutes INTEGER DEFAULT 30
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    cleaned_count INTEGER;
BEGIN
    UPDATE user_job_instances 
    SET status = 'error', error_message = 'Job instance timed out'
    WHERE status = 'running'
    AND last_activity < NOW() - (p_timeout_minutes || ' minutes')::INTERVAL;
    
    GET DIAGNOSTICS cleaned_count = ROW_COUNT;
    RETURN cleaned_count;
END;
$$;
