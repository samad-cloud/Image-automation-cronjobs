import * as dotenv from 'dotenv'
import cron from 'node-cron'
import { JiraFetchJob } from './jobs/JiraFetchJob'
import { EventProcessJob } from './jobs/EventProcessJob'

dotenv.config()

// Create job instances
const fetchJob = new JiraFetchJob()
const processJobs = Array(3).fill(null).map(() => new EventProcessJob())

// Fetch new events every hour
cron.schedule('0 * * * *', async () => {
  try {
    await fetchJob.execute()
  } catch (error) {
    console.error('Fetch job failed:', error)
  }
})

// Process events every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  await Promise.allSettled(
    processJobs.map(job => 
      job.execute().catch(error => 
        console.error(`Process job failed:`, error)
      )
    )
  )
})

// Start immediately for testing
fetchJob.execute().catch(console.error)
processJobs.forEach(job => job.execute().catch(console.error))