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
  job_type: 'jira-fetch' | 'event-process'
  instance_id: string
  status: 'running' | 'stopped' | 'error'
  last_activity: string
  error_message?: string
  created_at: string
}

export interface Database {
  public: {
    Tables: {
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
    }
  }
}