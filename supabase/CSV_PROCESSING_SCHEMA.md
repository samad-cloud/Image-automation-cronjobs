# CSV Processing System Database Schema

This document describes the database schema for the CSV upload and background job processing system.

## 📊 Table Overview

### 1. `csv_batches`
**Purpose**: Tracks uploaded CSV files and their overall processing status

**Key Fields**:
- `user_id`: Owner of the CSV batch
- `filename` & `original_filename`: File identification
- `total_rows`, `processed_rows`, `successful_rows`, `failed_rows`: Progress tracking
- `status`: Overall batch status (`uploaded` → `queued` → `processing` → `completed`)
- `storage_path`: Location of uploaded CSV file
- `max_concurrent_jobs`: Processing configuration
- `processing_rate_rows_per_minute`: Performance metrics

### 2. `csv_row_jobs`
**Purpose**: Individual row processing jobs from CSV batches

**Key Fields**:
- `batch_id`: Links to parent CSV batch
- `row_number`: Position in original CSV
- `row_data`: Original CSV row as JSON
- `status`: Job status (`pending` → `claimed` → `processing` → `completed`)
- `trigger_text`: Generated trigger for image generation
- `generated_prompts`, `generated_images`, `generated_tags`: Processing results
- `claimed_by`: Worker instance processing this job
- `retry_count`: Number of retry attempts

### 3. `csv_processing_workers`
**Purpose**: Tracks active worker instances processing CSV jobs

**Key Fields**:
- `instance_id`: Unique worker identifier
- `user_id`: User-specific workers (NULL for global workers)
- `batch_id`: Batch-specific workers (NULL for multi-batch workers)
- `status`: Worker status (`idle`, `processing`, `stopped`)
- `max_concurrent_jobs`: Worker capacity
- `last_heartbeat`: Health monitoring

### 4. `csv_processing_logs`
**Purpose**: Detailed logging for debugging and monitoring

**Key Fields**:
- `batch_id`, `row_job_id`: Context linking
- `log_level`: `DEBUG`, `INFO`, `WARN`, `ERROR`, `FATAL`
- `message`: Human-readable log message
- `operation`: Type of operation being logged
- `details`: Additional structured data

## 🔧 Database Functions

### Processing Functions

#### `claim_next_csv_row_job(worker_id, batch_id?, timeout_minutes?)`
- Claims the next available row job for processing
- Handles job timeouts and retries automatically
- Returns job details including row data

#### `update_csv_row_job_result(job_id, status, results...)`
- Updates job status and stores processing results
- Automatically updates batch progress statistics
- Marks batch as completed when all rows are done

#### `update_csv_worker_heartbeat(instance_id, status, stats...)`
- Updates worker health and statistics
- Upserts worker records automatically
- Tracks performance metrics

### Monitoring Functions

#### `get_csv_batch_progress(batch_id)`
- Returns comprehensive progress summary
- Includes percentage complete and processing rate
- Useful for real-time UI updates

#### `cleanup_stale_csv_workers(timeout_minutes?)`
- Cleans up unresponsive workers
- Releases claimed jobs back to queue
- Handles retry logic for failed jobs

## 🔐 Security (RLS Policies)

### Database Tables
- **Users** can only see their own CSV batches and related data
- **Service role** can manage workers and insert logs
- **Workers** are publicly viewable for monitoring
- **Real-time subscriptions** enabled for progress tracking

### Storage Buckets
- **csv-uploads**: Authenticated users can upload, users can only access their own files
- **csv-templates**: Authenticated users can upload, anyone can read templates
- **File organization**: Files stored in user-specific folders (`{user_id}/filename`)
- **Service role**: Full access to all storage operations

## 📈 Processing Flow

```
1. User uploads CSV → csv_batches record created
2. CSV parsed → csv_row_jobs records created for each row
3. Batch status → 'queued' → 'processing'
4. JobOrchestrator starts CSV processing workers
5. Workers claim jobs using claim_next_csv_row_job()
6. Workers process rows using existing agentic workflow
7. Generate 2 images per row (emotionally driven + white background)
8. Results stored using update_csv_row_job_result()
9. Batch automatically marked 'completed' when all rows done
```

## 🤖 CSV Background Processing

### Job Architecture
The CSV processing system uses the existing job orchestrator pattern:

- **CSVProcessJob**: Main worker class that processes individual CSV rows
- **JobOrchestrator**: Manages and starts CSV processing workers
- **Concurrent Processing**: Multiple workers process jobs in parallel
- **User Isolation**: Workers can be dedicated to specific users or batches

### Image Generation Workflow
For each CSV row, the system:

1. **Builds Trigger**: Combines `country + product_type + size + mpn + description`
2. **Hardcoded Styles**: Uses `['lifestyle_emotional', 'single_white_background']`
3. **Agentic Workflow**: Leverages existing `generateImagePrompts()` function
4. **Generates 2 Images**: One emotionally driven, one with white background
5. **Stores Results**: Saves prompts and metadata to database

### Worker Management
- **Global Workers**: Process any available jobs across all users
- **Dedicated Workers**: Handle specific batches or high-priority users
- **Auto-scaling**: Large batches (>20 rows) get dedicated workers
- **Health Monitoring**: Workers send heartbeats and track performance

## 🚀 Usage Examples

### Creating a CSV Batch
```sql
INSERT INTO csv_batches (
    user_id, filename, original_filename, total_rows, 
    csv_headers, storage_path
) VALUES (
    'user-uuid', 'processed_products.csv', 'products.csv', 1000,
    ARRAY['country', 'product_type', 'mpn', 'title'],
    'csv-uploads/user-uuid/products.csv'
);
```

### Getting Batch Progress
```sql
SELECT * FROM get_csv_batch_progress('batch-uuid');
```

### Claiming Next Job (Worker)
```sql
SELECT * FROM claim_next_csv_row_job('worker-instance-123');
```

### Updating Job Results (Worker)
```sql
SELECT update_csv_row_job_result(
    'job-uuid',
    'completed',
    'Generated trigger text',
    '{"prompts": ["prompt1", "prompt2"]}',
    '{"images": [{"url": "...", "model": "gpt-image-1"}]}',
    '{"tags": ["tag1", "tag2"]}',
    45.2
);
```

## 🔍 Monitoring Queries

### Active Batches
```sql
SELECT b.*, 
       ROUND((b.processed_rows::NUMERIC / b.total_rows) * 100, 2) as progress_pct
FROM csv_batches b 
WHERE status IN ('processing', 'queued')
ORDER BY created_at DESC;
```

### Worker Health
```sql
SELECT instance_id, status, last_heartbeat,
       current_job_count, total_jobs_processed
FROM csv_processing_workers 
WHERE last_heartbeat > NOW() - INTERVAL '5 minutes'
ORDER BY last_heartbeat DESC;
```

### Failed Jobs by Batch
```sql
SELECT b.filename, COUNT(*) as failed_count
FROM csv_batches b
JOIN csv_row_jobs rj ON b.id = rj.batch_id
WHERE rj.status = 'failed'
GROUP BY b.id, b.filename
ORDER BY failed_count DESC;
```

This schema provides a robust foundation for scalable CSV processing with comprehensive monitoring and error handling capabilities.
