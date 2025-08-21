#!/usr/bin/env node

import { PostProcessJob } from './PostProcessJob'

async function main() {
  const userId = process.env.USER_ID || undefined

  const job = new PostProcessJob(userId)

  // graceful shutdown
  process.on('SIGINT', () => process.exit(0))
  process.on('SIGTERM', () => process.exit(0))

  try {
    await job.execute()
    process.exit(0)
  } catch (err) {
    console.error('[POST-PROCESS-ENTRY] Fatal error:', err)
    process.exit(1)
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error('[POST-PROCESS-ENTRY] Unhandled:', e)
    process.exit(1)
  })
}

export { main }


