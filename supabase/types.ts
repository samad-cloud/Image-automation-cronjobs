export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// New types for structured image and tag tracking
export interface ImageData {
  url: string
  model: 'gpt-image-1' | 'imagen-4.0-ultra'
  prompt_index: number
  image_index: number
  filename: string
  generated_at: string
}

export interface TagData {
  tags: string[]
  prompt_index: number
  image_index: number
  model: 'gpt-image-1' | 'imagen-4.0-ultra'
}

// Multi-user job types
export interface CalendarEventRow {
  id: string
  user_id: string
  summary: string
  description?: string
  styles: string[]  // This should be string[] (array) not JSONB
  number_of_variations: number
  trigger_start: string
  trigger_end: string
}

export interface UserCredentials {
  user_id: string
  jira_config: {
    domain: string
    username: string
    apiKey: string
    projectName: string
    issueType: string
  }
  last_synced?: string
}

export interface GenerationRequest {
  source: 'calendar' | 'manual' | 'api'
  user_id: string
  org_id?: string
  calendar_event_id?: string
  manual_trigger?: string
  manual_prompt?: string
  manual_styles?: string[]
  manual_variations?: number
  trigger: string
  styles: string[]
  number_of_variations: number
}

export interface JobInstance {
  id: string
  user_id: string
  job_type: 'jira-fetch' | 'event-process' | 'csv-process'
  instance_id: string
  status: 'running' | 'stopped' | 'error'
  last_activity: string
  error_message?: string
  created_at: string
}

// CSV Processing Types
export interface CsvBatch {
  id: string
  user_id: string
  filename: string
  original_filename: string
  file_size_bytes: number
  total_rows: number
  processed_rows: number
  successful_rows: number
  failed_rows: number
  skipped_rows: number
  status: 'uploaded' | 'queued' | 'processing' | 'completed' | 'failed' | 'paused' | 'cancelled'
  storage_path: string | null
  storage_bucket: string | null
  max_concurrent_jobs: number
  retry_failed_rows: boolean
  max_retries: number
  current_processing_row: number
  estimated_completion_time: string | null
  processing_rate_rows_per_minute: number
  created_at: string
  queued_at: string | null
  started_at: string | null
  completed_at: string | null
  last_activity_at: string
  error_message: string | null
  error_details: Json | null
  csv_headers: string[] | null
  processing_config: Json | null
  metadata: Json | null
}

export interface CsvRowJob {
  id: string
  batch_id: string
  row_number: number
  status: 'pending' | 'claimed' | 'processing' | 'completed' | 'failed' | 'skipped' | 'retrying'
  row_data: Json
  trigger_text: string | null
  generated_prompts: Json | null
  generated_images: Json | null
  generated_tags: Json | null
  claimed_by: string | null
  claimed_at: string | null
  processing_timeout_at: string | null
  processing_time_seconds: number | null
  retry_count: number
  error_message: string | null
  error_details: Json | null
  last_error_at: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
}

export interface CsvProcessingWorker {
  id: string
  instance_id: string
  user_id: string | null
  batch_id: string | null
  status: 'idle' | 'processing' | 'paused' | 'stopped' | 'error'
  max_concurrent_jobs: number
  current_job_count: number
  total_jobs_processed: number
  total_jobs_failed: number
  average_processing_time_seconds: number
  last_heartbeat: string
  last_job_completed_at: string | null
  worker_version: string | null
  worker_config: Json | null
  created_at: string
  started_at: string | null
  stopped_at: string | null
}

export interface CsvProcessingLog {
  id: string
  batch_id: string | null
  row_job_id: string | null
  worker_instance_id: string | null
  log_level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL'
  message: string
  details: Json | null
  operation: string | null
  duration_ms: number | null
  created_at: string
}

export interface CsvTemplate {
  id: string
  name: string
  description: string | null
  template_type: 'product_catalog' | 'marketing_campaign' | 'social_media' | 'custom'
  required_columns: string[]
  optional_columns: string[]
  column_descriptions: Json | null
  sample_data: Json | null
  storage_path: string | null
  storage_bucket: string | null
  file_size_bytes: number | null
  version: number
  is_active: boolean
  is_default: boolean
  download_count: number
  usage_count: number
  created_at: string
  updated_at: string
}

export interface Database {
  public: {
    Tables: {
      csv_batches: {
        Row: CsvBatch
        Insert: Omit<CsvBatch, 'id' | 'created_at' | 'last_activity_at'> & {
          id?: string
          created_at?: string
          last_activity_at?: string
        }
        Update: Partial<Omit<CsvBatch, 'id' | 'created_at'>>
      }
      csv_row_jobs: {
        Row: CsvRowJob
        Insert: Omit<CsvRowJob, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Omit<CsvRowJob, 'id' | 'created_at'>>
      }
      csv_processing_workers: {
        Row: CsvProcessingWorker
        Insert: Omit<CsvProcessingWorker, 'id' | 'created_at' | 'last_heartbeat'> & {
          id?: string
          created_at?: string
          last_heartbeat?: string
        }
        Update: Partial<Omit<CsvProcessingWorker, 'id' | 'created_at'>>
      }
      csv_processing_logs: {
        Row: CsvProcessingLog
        Insert: Omit<CsvProcessingLog, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Omit<CsvProcessingLog, 'id' | 'created_at'>>
      }
      csv_templates: {
        Row: CsvTemplate
        Insert: Omit<CsvTemplate, 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<CsvTemplate, 'id' | 'created_at'>>
      }
      test_calendar_events: {
        Row: {
          id: string
          jira_id: string
          summary: string
          description: string | null
          due_date: string
          region: string
          product_type: string
          campaign_type: string
          status: 'pending' | 'processing' | 'completed' | 'failed'
          agent_result: Json | null
          image_data: ImageData[] | null
          tag_data: TagData[] | null
          processed_by: string | null
          error: string | null
          created_at: string
          updated_at: string
          locked_until: string | null
        }
        Insert: {
          id?: string
          jira_id: string
          summary: string
          description?: string | null
          due_date: string
          region: string
          product_type: string
          campaign_type: string
          status?: 'pending' | 'processing' | 'completed' | 'failed'
          agent_result?: Json | null
          image_data?: ImageData[] | null
          tag_data?: TagData[] | null
          processed_by?: string | null
          error?: string | null
          created_at?: string
          updated_at?: string
          locked_until?: string | null
        }
        Update: {
          id?: string
          jira_id?: string
          summary?: string
          description?: string | null
          due_date?: string
          region?: string
          product_type?: string
          campaign_type?: string
          status?: 'pending' | 'processing' | 'completed' | 'failed'
          agent_result?: Json | null
          image_data?: ImageData[] | null
          tag_data?: TagData[] | null
          processed_by?: string | null
          error?: string | null
          created_at?: string
          updated_at?: string
          locked_until?: string | null
        }
      }
      test_job_runs: {
        Row: {
          id: string
          job_name: string
          instance_id: string
          status: 'running' | 'completed' | 'failed'
          started_at: string
          completed_at: string | null
          error: string | null
          metadata: Json | null
        }
        Insert: {
          id?: string
          job_name: string
          instance_id: string
          status?: 'running' | 'completed' | 'failed'
          started_at?: string
          completed_at?: string | null
          error?: string | null
          metadata?: Json | null
        }
        Update: {
          id?: string
          job_name?: string
          instance_id?: string
          status?: 'running' | 'completed' | 'failed'
          started_at?: string
          completed_at?: string | null
          error?: string | null
          metadata?: Json | null
        }
      }
    }
    Functions: {
      test_claim_next_event: {
        Args: {
          p_worker_id: string
          p_timeout_minutes: number
        }
        Returns: {
          id: string
          jira_id: string
          summary: string
          description: string | null
          due_date: string
          region: string
          product_type: string
          campaign_type: string
        }[]
      }
      claim_next_csv_row_job: {
        Args: {
          p_worker_instance_id: string
          p_batch_id?: string
          p_timeout_minutes?: number
        }
        Returns: {
          id: string
          batch_id: string
          row_number: number
          row_data: Json
          retry_count: number
        }[]
      }
      update_csv_row_job_result: {
        Args: {
          p_job_id: string
          p_status: string
          p_trigger_text?: string
          p_generated_prompts?: Json
          p_generated_images?: Json
          p_generated_tags?: Json
          p_processing_time_seconds?: number
          p_error_message?: string
          p_error_details?: Json
        }
        Returns: boolean
      }
      update_csv_worker_heartbeat: {
        Args: {
          p_instance_id: string
          p_status?: string
          p_current_job_count?: number
          p_jobs_completed_delta?: number
          p_jobs_failed_delta?: number
        }
        Returns: boolean
      }
      cleanup_stale_csv_workers: {
        Args: {
          p_timeout_minutes?: number
        }
        Returns: number
      }
      get_csv_batch_progress: {
        Args: {
          p_batch_id: string
        }
        Returns: {
          batch_id: string
          status: string
          total_rows: number
          processed_rows: number
          successful_rows: number
          failed_rows: number
          skipped_rows: number
          pending_rows: number
          processing_rows: number
          progress_percentage: number
          estimated_completion_time: string | null
          processing_rate_per_minute: number
        }[]
      }
      get_available_csv_templates: {
        Args: {
          p_template_type?: string
        }
        Returns: {
          id: string
          name: string
          description: string
          template_type: string
          required_columns: string[]
          optional_columns: string[]
          column_descriptions: Json
          sample_data: Json
          is_default: boolean
          download_count: number
        }[]
      }
      increment_template_download: {
        Args: {
          p_template_id: string
        }
        Returns: boolean
      }
    }
  }
}