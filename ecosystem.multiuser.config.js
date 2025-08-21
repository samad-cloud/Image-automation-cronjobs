module.exports = {
  apps: [
    {
      name: "job-orchestrator",
      script: "npx",
      args: "ts-node --project tsconfig.prod.json src/jobs/orchestratorEntry.ts",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 5000,
      watch: ["src/jobs/JobOrchestrator.ts", "src/jobs/MultiUserJiraFetchJob.ts", "src/jobs/MultiUserEventProcessJob.ts", "src/jobs/CSVProcessJob.ts"],
      env: {
        NODE_ENV: "production",
        INSTANCE_ID: "orchestrator-main"
      }
    },
    // Backup individual jobs in case orchestrator fails
    {
      name: "multi-user-jira-fetch-backup",
      script: "npx",
      args: "ts-node --project tsconfig.prod.json src/jobs/multiUserJiraFetchEntry.ts",
      instances: 1,
      autorestart: true,
      max_restarts: 5,
      min_uptime: "30s",
      restart_delay: 10000,
      watch: ["src/jobs/MultiUserJiraFetchJob.ts"],
      env: {
        NODE_ENV: "production",
        INSTANCE_ID: "jira-fetch-backup"
      },
      // Start this only if orchestrator is down
      start: false
    },
    {
      name: "multi-user-event-process-backup",
      script: "npx",
      args: "ts-node --project tsconfig.prod.json src/jobs/multiUserEventProcessEntry.ts",
      instances: 2,
      autorestart: true,
      max_restarts: 5,
      min_uptime: "30s",
      restart_delay: 10000,
      watch: ["src/jobs/MultiUserEventProcessJob.ts"],
      env: {
        NODE_ENV: "production"
      },
      instance_var: "INSTANCE_ID",
      // Start this only if orchestrator is down
      start: false
    },
    {
      name: "multi-user-csv-process-backup",
      script: "npx",
      args: "ts-node --project tsconfig.prod.json src/jobs/multiUserCsvProcessEntry.ts",
      instances: 2,
      autorestart: true,
      max_restarts: 5,
      min_uptime: "30s",
      restart_delay: 10000,
      watch: ["src/jobs/CSVProcessJob.ts"],
      env: {
        NODE_ENV: "production",
        CSV_MAX_CONCURRENT_JOBS: "2"
      },
      instance_var: "INSTANCE_ID",
      // Start this only if orchestrator is down
      start: false
    },
    {
      name: "multi-user-post-process",
      script: "npx",
      args: "ts-node --project tsconfig.prod.json src/jobs/postProcessEntry.ts",
      instances: 1,
      autorestart: false,
      max_restarts: 5,
      min_uptime: "30s",
      restart_delay: 10000,
      watch: ["src/jobs/PostProcessJob.ts", "src/services/ImageEditService.ts"],
      env: {
        NODE_ENV: "production",
        SUPABASE_URL: process.env.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY
      },
      cron_restart: "*/5 * * * *",
      start: true
    }
  ]
}
