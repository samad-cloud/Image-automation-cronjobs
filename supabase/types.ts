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