-- Test script to verify CSV processing functions exist
-- Run this in Supabase SQL Editor to debug the issue

-- 1. Check if functions exist
SELECT routine_name, routine_type, data_type
FROM information_schema.routines 
WHERE routine_name LIKE '%csv%' 
ORDER BY routine_name;

-- 2. Check csv_row_jobs table structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'csv_row_jobs' 
ORDER BY ordinal_position;

-- 3. Test the claim function (this will show any errors)
SELECT * FROM claim_next_csv_row_job('test-worker-id', NULL, 15);

-- 4. Check if there are any csv_row_jobs with pending status
SELECT COUNT(*) as pending_jobs 
FROM csv_row_jobs 
WHERE status = 'pending';

-- 5. Check csv_batches table
SELECT id, status, total_rows 
FROM csv_batches 
ORDER BY created_at DESC 
LIMIT 5;
