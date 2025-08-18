-- CSV Processing System Migration
-- This migration creates all tables and functions needed for CSV upload and background job processing

-- 1. CSV Batches Table
-- Tracks uploaded CSV files and their overall processing status
CREATE TABLE IF NOT EXISTS csv_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    total_rows INTEGER NOT NULL,
    processed_rows INTEGER DEFAULT 0,
    successful_rows INTEGER DEFAULT 0,
    failed_rows INTEGER DEFAULT 0,
    skipped_rows INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'queued', 'processing', 'completed', 'failed', 'paused', 'cancelled')),
    
    -- File storage information
    storage_path TEXT, -- Path in Supabase storage or local filesystem
    storage_bucket TEXT DEFAULT 'csv-uploads',
    
    -- Processing configuration
    max_concurrent_jobs INTEGER DEFAULT 3,
    retry_failed_rows BOOLEAN DEFAULT true,
    max_retries INTEGER DEFAULT 2,
    
    -- Progress tracking
    current_processing_row INTEGER DEFAULT 0,
    estimated_completion_time TIMESTAMP WITH TIME ZONE,
    processing_rate_rows_per_minute NUMERIC DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    queued_at TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Error handling
    error_message TEXT,
    error_details JSONB,
    
    -- Metadata
    csv_headers TEXT[], -- Column names from CSV
    processing_config JSONB, -- Additional configuration options
    metadata JSONB -- Additional metadata (file preview, statistics, etc.)
);

-- 2. CSV Row Jobs Table  
-- Tracks individual row processing jobs from CSV batches
CREATE TABLE IF NOT EXISTS csv_row_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES csv_batches(id) ON DELETE CASCADE,
    row_number INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'processing', 'completed', 'failed', 'skipped', 'retrying')),
    
    -- Job data
    row_data JSONB NOT NULL, -- Original CSV row data as JSON
    trigger_text TEXT, -- Generated trigger for image generation
    
    -- Processing results
    generated_prompts JSONB, -- Array of prompts generated
    generated_images JSONB, -- Array of ImageData objects
    generated_tags JSONB, -- Array of TagData objects
    
    -- Worker and timing info
    claimed_by TEXT, -- Worker instance ID that claimed this job
    claimed_at TIMESTAMP WITH TIME ZONE,
    processing_timeout_at TIMESTAMP WITH TIME ZONE,
    
    -- Performance metrics
    processing_time_seconds NUMERIC,
    retry_count INTEGER DEFAULT 0,
    
    -- Error handling
    error_message TEXT,
    error_details JSONB,
    last_error_at TIMESTAMP WITH TIME ZONE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Constraints
    UNIQUE(batch_id, row_number)
);

-- 3. CSV Processing Workers Table
-- Tracks active workers processing CSV jobs
CREATE TABLE IF NOT EXISTS csv_processing_workers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id TEXT NOT NULL UNIQUE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE, -- NULL for global workers
    batch_id UUID REFERENCES csv_batches(id) ON DELETE CASCADE, -- NULL for multi-batch workers
    status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'processing', 'paused', 'stopped', 'error')),
    
    -- Worker configuration
    max_concurrent_jobs INTEGER DEFAULT 1,
    current_job_count INTEGER DEFAULT 0,
    
    -- Performance tracking
    total_jobs_processed INTEGER DEFAULT 0,
    total_jobs_failed INTEGER DEFAULT 0,
    average_processing_time_seconds NUMERIC DEFAULT 0,
    
    -- Health monitoring
    last_heartbeat TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_job_completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Worker metadata
    worker_version TEXT,
    worker_config JSONB,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    stopped_at TIMESTAMP WITH TIME ZONE
);

-- 4. CSV Processing Logs Table
-- Detailed logging for debugging and monitoring
CREATE TABLE IF NOT EXISTS csv_processing_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID REFERENCES csv_batches(id) ON DELETE CASCADE,
    row_job_id UUID REFERENCES csv_row_jobs(id) ON DELETE CASCADE,
    worker_instance_id TEXT,
    
    -- Log details
    log_level TEXT NOT NULL CHECK (log_level IN ('DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL')),
    message TEXT NOT NULL,
    details JSONB,
    
    -- Context
    operation TEXT, -- e.g., 'row_processing', 'batch_creation', 'worker_start'
    duration_ms INTEGER,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_csv_batches_user_id ON csv_batches(user_id);
CREATE INDEX IF NOT EXISTS idx_csv_batches_status ON csv_batches(status);
CREATE INDEX IF NOT EXISTS idx_csv_batches_created_at ON csv_batches(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_csv_row_jobs_batch_id ON csv_row_jobs(batch_id);
CREATE INDEX IF NOT EXISTS idx_csv_row_jobs_status ON csv_row_jobs(status);
CREATE INDEX IF NOT EXISTS idx_csv_row_jobs_claimed_by ON csv_row_jobs(claimed_by);
CREATE INDEX IF NOT EXISTS idx_csv_row_jobs_batch_status ON csv_row_jobs(batch_id, status);
CREATE INDEX IF NOT EXISTS idx_csv_row_jobs_processing_queue ON csv_row_jobs(status, created_at) WHERE status IN ('pending', 'retrying');

CREATE INDEX IF NOT EXISTS idx_csv_workers_instance_id ON csv_processing_workers(instance_id);
CREATE INDEX IF NOT EXISTS idx_csv_workers_status ON csv_processing_workers(status);
CREATE INDEX IF NOT EXISTS idx_csv_workers_heartbeat ON csv_processing_workers(last_heartbeat);

CREATE INDEX IF NOT EXISTS idx_csv_logs_batch_id ON csv_processing_logs(batch_id);
CREATE INDEX IF NOT EXISTS idx_csv_logs_created_at ON csv_processing_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_csv_logs_level ON csv_processing_logs(log_level);

-- 5. Functions for CSV processing

-- Function to claim next available CSV row job
CREATE OR REPLACE FUNCTION claim_next_csv_row_job(
    p_worker_instance_id TEXT,
    p_batch_id UUID DEFAULT NULL,
    p_timeout_minutes INTEGER DEFAULT 15
)
RETURNS TABLE(
    id UUID,
    batch_id UUID,
    row_number INTEGER,
    row_data JSONB,
    retry_count INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
    claimed_job_id UUID;
    timeout_timestamp TIMESTAMP WITH TIME ZONE;
BEGIN
    timeout_timestamp := NOW() + (p_timeout_minutes || ' minutes')::INTERVAL;
    
    -- First, release any timed-out jobs
    UPDATE csv_row_jobs 
    SET 
        status = CASE 
            WHEN retry_count < (SELECT max_retries FROM csv_batches WHERE csv_batches.id = csv_row_jobs.batch_id)
            THEN 'retrying'
            ELSE 'failed'
        END,
        claimed_by = NULL,
        claimed_at = NULL,
        processing_timeout_at = NULL,
        error_message = CASE 
            WHEN retry_count >= (SELECT max_retries FROM csv_batches WHERE csv_batches.id = csv_row_jobs.batch_id)
            THEN 'Job timed out and exceeded max retries'
            ELSE error_message
        END,
        retry_count = CASE 
            WHEN retry_count < (SELECT max_retries FROM csv_batches WHERE csv_batches.id = csv_row_jobs.batch_id)
            THEN retry_count + 1
            ELSE retry_count
        END
    WHERE status = 'claimed' 
    AND processing_timeout_at < NOW();
    
    -- Claim next available job
    UPDATE csv_row_jobs 
    SET 
        status = 'claimed',
        claimed_by = p_worker_instance_id,
        claimed_at = NOW(),
        processing_timeout_at = timeout_timestamp
    WHERE csv_row_jobs.id = (
        SELECT rj.id 
        FROM csv_row_jobs rj
        JOIN csv_batches cb ON rj.batch_id = cb.id
        WHERE rj.status IN ('pending', 'retrying')
        AND cb.status = 'processing'
        AND (p_batch_id IS NULL OR rj.batch_id = p_batch_id)
        ORDER BY rj.retry_count ASC, rj.created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
    )
    RETURNING csv_row_jobs.id INTO claimed_job_id;
    
    -- Return the claimed job details
    RETURN QUERY
    SELECT 
        rj.id,
        rj.batch_id,
        rj.row_number,
        rj.row_data,
        rj.retry_count
    FROM csv_row_jobs rj
    WHERE rj.id = claimed_job_id;
END;
$$;

-- Function to update CSV row job status and results
CREATE OR REPLACE FUNCTION update_csv_row_job_result(
    p_job_id UUID,
    p_status TEXT,
    p_trigger_text TEXT DEFAULT NULL,
    p_generated_prompts JSONB DEFAULT NULL,
    p_generated_images JSONB DEFAULT NULL,
    p_generated_tags JSONB DEFAULT NULL,
    p_processing_time_seconds NUMERIC DEFAULT NULL,
    p_error_message TEXT DEFAULT NULL,
    p_error_details JSONB DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
    batch_record_id UUID;
    job_status TEXT;
BEGIN
    -- Update the row job
    UPDATE csv_row_jobs 
    SET 
        status = p_status,
        trigger_text = COALESCE(p_trigger_text, trigger_text),
        generated_prompts = COALESCE(p_generated_prompts, generated_prompts),
        generated_images = COALESCE(p_generated_images, generated_images),
        generated_tags = COALESCE(p_generated_tags, generated_tags),
        processing_time_seconds = COALESCE(p_processing_time_seconds, processing_time_seconds),
        error_message = p_error_message,
        error_details = p_error_details,
        completed_at = CASE WHEN p_status IN ('completed', 'failed', 'skipped') THEN NOW() ELSE completed_at END,
        started_at = CASE WHEN started_at IS NULL AND p_status = 'processing' THEN NOW() ELSE started_at END,
        last_error_at = CASE WHEN p_status = 'failed' THEN NOW() ELSE last_error_at END,
        claimed_by = CASE WHEN p_status IN ('completed', 'failed', 'skipped') THEN NULL ELSE claimed_by END,
        claimed_at = CASE WHEN p_status IN ('completed', 'failed', 'skipped') THEN NULL ELSE claimed_at END,
        processing_timeout_at = CASE WHEN p_status IN ('completed', 'failed', 'skipped') THEN NULL ELSE processing_timeout_at END
    WHERE id = p_job_id
    RETURNING batch_id INTO batch_record_id;
    
    -- Update batch statistics
    IF batch_record_id IS NOT NULL THEN
        UPDATE csv_batches 
        SET 
            processed_rows = (
                SELECT COUNT(*) 
                FROM csv_row_jobs 
                WHERE batch_id = batch_record_id 
                AND status IN ('completed', 'failed', 'skipped')
            ),
            successful_rows = (
                SELECT COUNT(*) 
                FROM csv_row_jobs 
                WHERE batch_id = batch_record_id 
                AND status = 'completed'
            ),
            failed_rows = (
                SELECT COUNT(*) 
                FROM csv_row_jobs 
                WHERE batch_id = batch_record_id 
                AND status = 'failed'
            ),
            skipped_rows = (
                SELECT COUNT(*) 
                FROM csv_row_jobs 
                WHERE batch_id = batch_record_id 
                AND status = 'skipped'
            ),
            last_activity_at = NOW(),
            -- Update batch status to completed if all rows are done
            status = CASE 
                WHEN (
                    SELECT COUNT(*) 
                    FROM csv_row_jobs 
                    WHERE batch_id = batch_record_id 
                    AND status IN ('pending', 'claimed', 'processing', 'retrying')
                ) = 0 THEN 'completed'
                ELSE status
            END,
            completed_at = CASE 
                WHEN (
                    SELECT COUNT(*) 
                    FROM csv_row_jobs 
                    WHERE batch_id = batch_record_id 
                    AND status IN ('pending', 'claimed', 'processing', 'retrying')
                ) = 0 THEN NOW()
                ELSE completed_at
            END
        WHERE id = batch_record_id;
    END IF;
    
    RETURN FOUND;
END;
$$;

-- Function to update worker heartbeat and statistics
CREATE OR REPLACE FUNCTION update_csv_worker_heartbeat(
    p_instance_id TEXT,
    p_status TEXT DEFAULT 'processing',
    p_current_job_count INTEGER DEFAULT NULL,
    p_jobs_completed_delta INTEGER DEFAULT 0,
    p_jobs_failed_delta INTEGER DEFAULT 0
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO csv_processing_workers (
        instance_id, 
        status, 
        current_job_count,
        last_heartbeat
    ) VALUES (
        p_instance_id, 
        p_status, 
        COALESCE(p_current_job_count, 0),
        NOW()
    )
    ON CONFLICT (instance_id) 
    DO UPDATE SET
        status = p_status,
        current_job_count = COALESCE(p_current_job_count, csv_processing_workers.current_job_count),
        total_jobs_processed = csv_processing_workers.total_jobs_processed + p_jobs_completed_delta,
        total_jobs_failed = csv_processing_workers.total_jobs_failed + p_jobs_failed_delta,
        last_heartbeat = NOW(),
        last_job_completed_at = CASE 
            WHEN p_jobs_completed_delta > 0 THEN NOW() 
            ELSE csv_processing_workers.last_job_completed_at 
        END;
    
    RETURN TRUE;
END;
$$;

-- Function to cleanup stale workers and jobs
CREATE OR REPLACE FUNCTION cleanup_stale_csv_workers(
    p_timeout_minutes INTEGER DEFAULT 30
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    cleaned_workers INTEGER := 0;
    cleaned_jobs INTEGER := 0;
BEGIN
    -- Mark stale workers as stopped
    UPDATE csv_processing_workers 
    SET status = 'stopped', stopped_at = NOW()
    WHERE status IN ('processing', 'idle')
    AND last_heartbeat < NOW() - (p_timeout_minutes || ' minutes')::INTERVAL;
    
    GET DIAGNOSTICS cleaned_workers = ROW_COUNT;
    
    -- Release jobs claimed by stale workers
    UPDATE csv_row_jobs 
    SET 
        status = CASE 
            WHEN retry_count < (SELECT max_retries FROM csv_batches WHERE csv_batches.id = csv_row_jobs.batch_id)
            THEN 'retrying'
            ELSE 'failed'
        END,
        claimed_by = NULL,
        claimed_at = NULL,
        processing_timeout_at = NULL,
        error_message = 'Worker became unresponsive',
        retry_count = retry_count + 1
    WHERE status = 'claimed' 
    AND claimed_by IN (
        SELECT instance_id 
        FROM csv_processing_workers 
        WHERE status = 'stopped'
        AND stopped_at > NOW() - INTERVAL '1 hour'
    );
    
    GET DIAGNOSTICS cleaned_jobs = ROW_COUNT;
    
    -- Log cleanup activity
    INSERT INTO csv_processing_logs (
        log_level, 
        message, 
        operation,
        details
    ) VALUES (
        'INFO',
        'Cleaned up stale workers and jobs',
        'cleanup',
        jsonb_build_object(
            'workers_cleaned', cleaned_workers,
            'jobs_released', cleaned_jobs,
            'timeout_minutes', p_timeout_minutes
        )
    );
    
    RETURN cleaned_workers + cleaned_jobs;
END;
$$;

-- Function to get CSV batch progress summary
CREATE OR REPLACE FUNCTION get_csv_batch_progress(p_batch_id UUID)
RETURNS TABLE(
    batch_id UUID,
    status TEXT,
    total_rows INTEGER,
    processed_rows INTEGER,
    successful_rows INTEGER,
    failed_rows INTEGER,
    skipped_rows INTEGER,
    pending_rows INTEGER,
    processing_rows INTEGER,
    progress_percentage NUMERIC,
    estimated_completion_time TIMESTAMP WITH TIME ZONE,
    processing_rate_per_minute NUMERIC
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cb.id,
        cb.status,
        cb.total_rows,
        cb.processed_rows,
        cb.successful_rows,
        cb.failed_rows,
        cb.skipped_rows,
        (SELECT COUNT(*)::INTEGER FROM csv_row_jobs WHERE batch_id = cb.id AND status IN ('pending', 'retrying')) as pending_rows,
        (SELECT COUNT(*)::INTEGER FROM csv_row_jobs WHERE batch_id = cb.id AND status IN ('claimed', 'processing')) as processing_rows,
        CASE 
            WHEN cb.total_rows > 0 THEN ROUND((cb.processed_rows::NUMERIC / cb.total_rows::NUMERIC) * 100, 2)
            ELSE 0
        END as progress_percentage,
        cb.estimated_completion_time,
        cb.processing_rate_rows_per_minute
    FROM csv_batches cb
    WHERE cb.id = p_batch_id;
END;
$$;

-- Add RLS (Row Level Security) policies
ALTER TABLE csv_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE csv_row_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE csv_processing_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE csv_processing_logs ENABLE ROW LEVEL SECURITY;

-- Users can only see their own CSV batches
CREATE POLICY "Users can manage their own CSV batches" 
ON csv_batches FOR ALL 
USING (auth.uid() = user_id);

-- Users can only see row jobs from their own batches
CREATE POLICY "Users can view their own CSV row jobs" 
ON csv_row_jobs FOR ALL 
USING (
    batch_id IN (
        SELECT id FROM csv_batches WHERE user_id = auth.uid()
    )
);

-- Workers can be viewed by anyone (for monitoring)
CREATE POLICY "CSV workers are publicly viewable" 
ON csv_processing_workers FOR SELECT 
USING (true);

-- Service role can manage workers
CREATE POLICY "Service role can manage CSV workers" 
ON csv_processing_workers FOR ALL 
USING (auth.role() = 'service_role');

-- Logs can be viewed by batch owners
CREATE POLICY "Users can view logs for their batches" 
ON csv_processing_logs FOR SELECT 
USING (
    batch_id IN (
        SELECT id FROM csv_batches WHERE user_id = auth.uid()
    )
);

-- Service role can insert logs
CREATE POLICY "Service role can insert CSV logs" 
ON csv_processing_logs FOR INSERT 
WITH CHECK (auth.role() = 'service_role');

-- 5. CSV Templates Table
-- Stores CSV templates for different use cases
CREATE TABLE IF NOT EXISTS csv_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    template_type TEXT NOT NULL CHECK (template_type IN ('product_catalog', 'marketing_campaign', 'social_media', 'custom')),
    
    -- Template structure
    required_columns TEXT[] NOT NULL, -- Column names that must be present
    optional_columns TEXT[] DEFAULT '{}',
    column_descriptions JSONB, -- JSON object mapping column names to descriptions
    sample_data JSONB, -- Sample rows for template
    
    -- Template file
    storage_path TEXT, -- Path to downloadable CSV template file
    storage_bucket TEXT DEFAULT 'csv-templates',
    file_size_bytes BIGINT,
    
    -- Metadata
    version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false, -- Only one default per template_type
    
    -- Usage tracking
    download_count INTEGER DEFAULT 0,
    usage_count INTEGER DEFAULT 0, -- How many batches used this template
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for CSV templates
CREATE INDEX IF NOT EXISTS idx_csv_templates_type ON csv_templates(template_type);
CREATE INDEX IF NOT EXISTS idx_csv_templates_active ON csv_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_csv_templates_default ON csv_templates(template_type, is_default) WHERE is_default = true;

-- Add template_id reference to csv_batches
ALTER TABLE csv_batches ADD COLUMN template_id UUID REFERENCES csv_templates(id);
CREATE INDEX IF NOT EXISTS idx_csv_batches_template ON csv_batches(template_id);

-- Function to get available CSV templates
CREATE OR REPLACE FUNCTION get_available_csv_templates(
    p_template_type TEXT DEFAULT NULL
)
RETURNS TABLE(
    id UUID,
    name TEXT,
    description TEXT,
    template_type TEXT,
    required_columns TEXT[],
    optional_columns TEXT[],
    column_descriptions JSONB,
    sample_data JSONB,
    is_default BOOLEAN,
    download_count INTEGER
)
LANGUAGE sql
AS $$
    SELECT 
        t.id,
        t.name,
        t.description,
        t.template_type,
        t.required_columns,
        t.optional_columns,
        t.column_descriptions,
        t.sample_data,
        t.is_default,
        t.download_count
    FROM csv_templates t
    WHERE t.is_active = true
    AND (p_template_type IS NULL OR t.template_type = p_template_type)
    ORDER BY t.is_default DESC, t.download_count DESC, t.name ASC;
$$;

-- Function to increment template download count
CREATE OR REPLACE FUNCTION increment_template_download(p_template_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE csv_templates 
    SET download_count = download_count + 1,
        updated_at = NOW()
    WHERE id = p_template_id;
    
    RETURN FOUND;
END;
$$;

-- Insert default templates
INSERT INTO csv_templates (
    name, 
    description, 
    template_type, 
    required_columns, 
    optional_columns,
    column_descriptions,
    sample_data,
    is_default
) VALUES 
(
    'Product Catalog Template',
    'Standard template for product catalog image generation',
    'product_catalog',
    ARRAY['country', 'product_type', 'mpn', 'title'],
    ARRAY['description', 'size', 'color', 'material', 'style'],
    jsonb_build_object(
        'country', 'Target market country (e.g., US, UK, DE)',
        'product_type', 'Category of product (e.g., Mug, Calendar, Print)',
        'mpn', 'Manufacturer Part Number - unique identifier',
        'title', 'Product title/name',
        'description', 'Detailed product description',
        'size', 'Product dimensions or size specification',
        'color', 'Primary color or color scheme',
        'material', 'Material composition',
        'style', 'Design style or theme'
    ),
    jsonb_build_array(
        jsonb_build_object(
            'country', 'US',
            'product_type', 'Mug',
            'mpn', 'MUG-001',
            'title', 'Premium Coffee Mug',
            'description', 'High-quality ceramic coffee mug with modern design',
            'size', '325ml',
            'color', 'White',
            'material', 'Ceramic',
            'style', 'Modern'
        ),
        jsonb_build_object(
            'country', 'UK',
            'product_type', 'Calendar',
            'mpn', 'CAL-A4-2024',
            'title', 'Wall Calendar 2024',
            'description', 'Beautiful wall calendar featuring nature photography',
            'size', 'A4',
            'color', 'Full Color',
            'material', 'Premium Paper',
            'style', 'Photography'
        )
    ),
    true
),
(
    'Marketing Campaign Template',
    'Template for marketing campaign image generation',
    'marketing_campaign',
    ARRAY['campaign_name', 'target_audience', 'message', 'call_to_action'],
    ARRAY['brand_colors', 'style_preferences', 'channel', 'format'],
    jsonb_build_object(
        'campaign_name', 'Name of the marketing campaign',
        'target_audience', 'Target demographic or audience',
        'message', 'Main marketing message or tagline',
        'call_to_action', 'Desired action from viewers',
        'brand_colors', 'Brand color palette',
        'style_preferences', 'Visual style preferences',
        'channel', 'Distribution channel (social, email, print)',
        'format', 'Image format requirements'
    ),
    jsonb_build_array(
        jsonb_build_object(
            'campaign_name', 'Summer Sale 2024',
            'target_audience', 'Young adults 18-35',
            'message', 'Beat the heat with cool savings',
            'call_to_action', 'Shop Now',
            'brand_colors', 'Blue, Orange, White',
            'style_preferences', 'Modern, vibrant',
            'channel', 'Social Media',
            'format', 'Square 1080x1080'
        )
    ),
    true
),
(
    'Social Media Template',
    'Template for social media content generation',
    'social_media',
    ARRAY['platform', 'content_type', 'theme', 'text_overlay'],
    ARRAY['hashtags', 'aspect_ratio', 'style', 'mood'],
    jsonb_build_object(
        'platform', 'Social media platform (Instagram, Facebook, Twitter)',
        'content_type', 'Type of content (post, story, ad)',
        'theme', 'Content theme or topic',
        'text_overlay', 'Text to overlay on image',
        'hashtags', 'Relevant hashtags',
        'aspect_ratio', 'Image dimensions',
        'style', 'Visual style',
        'mood', 'Emotional tone'
    ),
    jsonb_build_array(
        jsonb_build_object(
            'platform', 'Instagram',
            'content_type', 'Post',
            'theme', 'Motivation Monday',
            'text_overlay', 'Start your week strong!',
            'hashtags', '#MotivationMonday #Success #Goals',
            'aspect_ratio', '1:1',
            'style', 'Minimalist',
            'mood', 'Inspiring'
        )
    ),
    true
);

-- Add RLS policy for templates (publicly readable)
ALTER TABLE csv_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CSV templates are publicly readable" 
ON csv_templates FOR SELECT 
USING (is_active = true);

-- Service role can manage templates
CREATE POLICY "Service role can manage CSV templates" 
ON csv_templates FOR ALL 
USING (auth.role() = 'service_role');

-- Create storage buckets for CSV files
INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('csv-uploads', 'csv-uploads', false),
  ('csv-templates', 'csv-templates', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies for CSV uploads bucket
CREATE POLICY "Authenticated users can upload CSV files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'csv-uploads' 
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Users can read their own CSV files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'csv-uploads' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own CSV files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'csv-uploads' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Storage RLS policies for CSV templates bucket
CREATE POLICY "Authenticated users can upload CSV templates"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'csv-templates' 
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Anyone can read CSV templates"
ON storage.objects FOR SELECT
USING (bucket_id = 'csv-templates');

CREATE POLICY "Users can delete their own CSV templates"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'csv-templates' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Service role can manage all files
CREATE POLICY "Service role can manage CSV uploads"
ON storage.objects FOR ALL
USING (
  bucket_id = 'csv-uploads' 
  AND auth.role() = 'service_role'
);

CREATE POLICY "Service role can manage CSV templates"
ON storage.objects FOR ALL
USING (
  bucket_id = 'csv-templates' 
  AND auth.role() = 'service_role'
);

-- Enable real-time subscriptions for progress tracking
ALTER PUBLICATION supabase_realtime ADD TABLE csv_batches;
ALTER PUBLICATION supabase_realtime ADD TABLE csv_row_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE csv_processing_workers;

-- =====================================================
-- SQL FUNCTIONS FOR CSV PROCESSING
-- =====================================================

-- Drop existing functions if they exist (to handle type changes)
DROP FUNCTION IF EXISTS claim_next_csv_row_job(text, uuid, integer);
DROP FUNCTION IF EXISTS update_csv_row_job_result(uuid, text, text, jsonb, jsonb, jsonb, numeric, text, jsonb);
DROP FUNCTION IF EXISTS update_csv_worker_heartbeat(text, text, integer, integer, integer);
DROP FUNCTION IF EXISTS get_csv_batch_progress(uuid);
DROP FUNCTION IF EXISTS update_csv_batch_progress(uuid);
DROP FUNCTION IF EXISTS cleanup_stale_csv_workers(integer);
DROP FUNCTION IF EXISTS get_available_csv_templates();
DROP FUNCTION IF EXISTS increment_template_download(uuid);

-- Function to claim the next available CSV row job
CREATE OR REPLACE FUNCTION claim_next_csv_row_job(
    p_worker_instance_id TEXT,
    p_batch_id UUID DEFAULT NULL,
    p_timeout_minutes INTEGER DEFAULT 15
) RETURNS SETOF csv_row_jobs AS $$
DECLARE
    claimed_job csv_row_jobs;
BEGIN
    -- Claim the next available job
    UPDATE csv_row_jobs 
    SET 
        status = 'processing',
        claimed_by = p_worker_instance_id,
        claimed_at = NOW(),
        processing_timeout_at = NOW() + (p_timeout_minutes || ' minutes')::INTERVAL,
        started_at = NOW()
    WHERE id = (
        SELECT id 
        FROM csv_row_jobs 
        WHERE status = 'pending' 
        AND (p_batch_id IS NULL OR batch_id = p_batch_id)
        AND (claimed_by IS NULL OR processing_timeout_at < NOW())
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
    )
    RETURNING * INTO claimed_job;
    
    IF claimed_job.id IS NOT NULL THEN
        RETURN NEXT claimed_job;
    END IF;
    
    RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update CSV row job results
CREATE OR REPLACE FUNCTION update_csv_row_job_result(
    p_job_id UUID,
    p_status TEXT,
    p_trigger_text TEXT DEFAULT NULL,
    p_generated_prompts JSONB DEFAULT NULL,
    p_generated_images JSONB DEFAULT NULL,
    p_generated_tags JSONB DEFAULT NULL,
    p_processing_time_seconds NUMERIC DEFAULT NULL,
    p_error_message TEXT DEFAULT NULL,
    p_error_details JSONB DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    UPDATE csv_row_jobs 
    SET 
        status = p_status,
        trigger_text = COALESCE(p_trigger_text, trigger_text),
        generated_prompts = COALESCE(p_generated_prompts, generated_prompts),
        generated_images = COALESCE(p_generated_images, generated_images),
        generated_tags = COALESCE(p_generated_tags, generated_tags),
        processing_time_seconds = COALESCE(p_processing_time_seconds, processing_time_seconds),
        error_message = CASE WHEN p_status = 'failed' THEN p_error_message ELSE NULL END,
        error_details = CASE WHEN p_status = 'failed' THEN p_error_details ELSE NULL END,
        last_error_at = CASE WHEN p_status = 'failed' THEN NOW() ELSE last_error_at END,
        completed_at = CASE WHEN p_status IN ('completed', 'failed') THEN NOW() ELSE completed_at END,
        retry_count = CASE WHEN p_status = 'failed' THEN retry_count + 1 ELSE retry_count END
    WHERE id = p_job_id;
    
    -- Update batch progress
    PERFORM update_csv_batch_progress(
        (SELECT batch_id FROM csv_row_jobs WHERE id = p_job_id)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update worker heartbeat
CREATE OR REPLACE FUNCTION update_csv_worker_heartbeat(
    p_instance_id TEXT,
    p_status TEXT DEFAULT 'processing',
    p_current_job_count INTEGER DEFAULT 0,
    p_jobs_completed_delta INTEGER DEFAULT 0,
    p_jobs_failed_delta INTEGER DEFAULT 0
) RETURNS VOID AS $$
BEGIN
    INSERT INTO csv_processing_workers (
        instance_id,
        status,
        current_job_count,
        jobs_completed,
        jobs_failed,
        last_heartbeat
    ) VALUES (
        p_instance_id,
        p_status,
        p_current_job_count,
        p_jobs_completed_delta,
        p_jobs_failed_delta,
        NOW()
    )
    ON CONFLICT (instance_id) DO UPDATE SET
        status = EXCLUDED.status,
        current_job_count = EXCLUDED.current_job_count,
        jobs_completed = csv_processing_workers.jobs_completed + EXCLUDED.jobs_completed,
        jobs_failed = csv_processing_workers.jobs_failed + EXCLUDED.jobs_failed,
        last_heartbeat = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get batch progress
CREATE OR REPLACE FUNCTION get_csv_batch_progress(p_batch_id UUID)
RETURNS TABLE (
    total_jobs BIGINT,
    pending_jobs BIGINT,
    processing_jobs BIGINT,
    completed_jobs BIGINT,
    failed_jobs BIGINT,
    progress_percentage NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_jobs,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_jobs,
        COUNT(*) FILTER (WHERE status = 'processing') as processing_jobs,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_jobs,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_jobs,
        CASE 
            WHEN COUNT(*) = 0 THEN 0
            ELSE ROUND((COUNT(*) FILTER (WHERE status IN ('completed', 'failed'))::NUMERIC / COUNT(*)::NUMERIC) * 100, 2)
        END as progress_percentage
    FROM csv_row_jobs 
    WHERE batch_id = p_batch_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update batch progress and status
CREATE OR REPLACE FUNCTION update_csv_batch_progress(p_batch_id UUID)
RETURNS VOID AS $$
DECLARE
    progress_info RECORD;
    batch_info RECORD;
BEGIN
    -- Get progress information
    SELECT * INTO progress_info FROM get_csv_batch_progress(p_batch_id);
    
    -- Get current batch info
    SELECT status, total_rows INTO batch_info FROM csv_batches WHERE id = p_batch_id;
    
    -- Update batch status based on progress
    UPDATE csv_batches 
    SET 
        processed_rows = progress_info.completed_jobs + progress_info.failed_jobs,
        failed_rows = progress_info.failed_jobs,
        progress_percentage = progress_info.progress_percentage,
        status = CASE 
            WHEN progress_info.pending_jobs = 0 AND progress_info.processing_jobs = 0 THEN 
                CASE WHEN progress_info.failed_jobs = 0 THEN 'completed' ELSE 'failed' END
            WHEN progress_info.processing_jobs > 0 OR batch_info.status = 'queued' THEN 'processing'
            ELSE batch_info.status
        END,
        processing_started_at = CASE 
            WHEN batch_info.status = 'queued' AND progress_info.processing_jobs > 0 THEN NOW()
            ELSE (SELECT processing_started_at FROM csv_batches WHERE id = p_batch_id)
        END,
        processing_completed_at = CASE 
            WHEN progress_info.pending_jobs = 0 AND progress_info.processing_jobs = 0 THEN NOW()
            ELSE NULL
        END
    WHERE id = p_batch_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to cleanup stale workers
CREATE OR REPLACE FUNCTION cleanup_stale_csv_workers(p_timeout_minutes INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    cleaned_count INTEGER;
BEGIN
    -- Reset jobs claimed by stale workers
    UPDATE csv_row_jobs 
    SET 
        status = 'pending',
        claimed_by = NULL,
        claimed_at = NULL,
        processing_timeout_at = NULL,
        started_at = NULL
    WHERE status = 'processing' 
    AND processing_timeout_at < NOW() - (p_timeout_minutes || ' minutes')::INTERVAL;
    
    GET DIAGNOSTICS cleaned_count = ROW_COUNT;
    
    -- Mark stale workers as stopped
    UPDATE csv_processing_workers 
    SET status = 'stopped'
    WHERE last_heartbeat < NOW() - (p_timeout_minutes || ' minutes')::INTERVAL
    AND status != 'stopped';
    
    RETURN cleaned_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get available templates
CREATE OR REPLACE FUNCTION get_available_csv_templates()
RETURNS SETOF csv_templates AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM csv_templates 
    ORDER BY is_default DESC, created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to increment template download count
CREATE OR REPLACE FUNCTION increment_template_download(p_template_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE csv_templates 
    SET 
        download_count = download_count + 1,
        last_downloaded_at = NOW()
    WHERE id = p_template_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
