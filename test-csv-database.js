const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

async function testCsvDatabase() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  console.log('🔍 Testing CSV Database Functions...\n')

  try {
    // Test 1: Check if csv_row_jobs table exists and has correct columns
    console.log('1. Checking csv_row_jobs table structure...')
    const { data: tableInfo, error: tableError } = await supabase
      .from('csv_row_jobs')
      .select('*')
      .limit(1)

    if (tableError) {
      console.error('❌ csv_row_jobs table error:', tableError.message)
    } else {
      console.log('✅ csv_row_jobs table exists')
    }

    // Test 2: Check available jobs
    console.log('\n2. Checking for available jobs...')
    const { data: availableJobs, error: jobsError } = await supabase
      .from('csv_row_jobs')
      .select('id, status, claimed_by')
      .eq('status', 'pending')
      .is('claimed_by', null)
      .limit(5)

    if (jobsError) {
      console.error('❌ Error checking jobs:', jobsError.message)
    } else {
      console.log(`✅ Found ${availableJobs.length} available jobs`)
      if (availableJobs.length > 0) {
        console.log('   Sample job:', availableJobs[0])
      }
    }

    // Test 3: Test the claim function
    console.log('\n3. Testing claim_next_csv_row_job function...')
    const { data: claimedJobs, error: claimError } = await supabase
      .rpc('claim_next_csv_row_job', {
        p_worker_instance_id: 'test-worker-' + Date.now(),
        p_batch_id: null,
        p_timeout_minutes: 15
      })

    if (claimError) {
      console.error('❌ Claim function error:', claimError)
    } else {
      console.log('✅ Claim function works')
      console.log(`   Claimed ${claimedJobs?.length || 0} jobs`)
      if (claimedJobs?.length > 0) {
        console.log('   Claimed job:', claimedJobs[0])
      }
    }

    // Test 4: Check csv_batches
    console.log('\n4. Checking csv_batches...')
    const { data: batches, error: batchError } = await supabase
      .from('csv_batches')
      .select('id, status, total_rows, processed_rows')
      .order('created_at', { ascending: false })
      .limit(3)

    if (batchError) {
      console.error('❌ Batches error:', batchError.message)
    } else {
      console.log(`✅ Found ${batches.length} batches`)
      batches.forEach(batch => {
        console.log(`   Batch ${batch.id}: ${batch.status} (${batch.processed_rows}/${batch.total_rows})`)
      })
    }

  } catch (error) {
    console.error('💥 Unexpected error:', error)
  }
}

// Run the test
testCsvDatabase()
  .then(() => {
    console.log('\n🎉 Test completed')
    process.exit(0)
  })
  .catch(error => {
    console.error('\n💥 Test failed:', error)
    process.exit(1)
  })
