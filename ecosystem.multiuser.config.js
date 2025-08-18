module.exports = {
  apps: [
    {
      name: "job-orchestrator",
      script: "npx",
      args: "ts-node src/jobs/orchestratorEntry.ts",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 5000,
      watch: ["src/jobs/JobOrchestrator.ts", "src/jobs/MultiUserJiraFetchJob.ts", "src/jobs/MultiUserEventProcessJob.ts"],
      env: {
        NODE_ENV: "production",
        INSTANCE_ID: "orchestrator-main"
      }
    },
    // Backup individual jobs in case orchestrator fails
    {
      name: "multi-user-jira-fetch-backup",
      script: "npx",
      args: "ts-node src/jobs/multiUserJiraFetchEntry.ts",
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
      args: "ts-node src/jobs/multiUserEventProcessEntry.ts",
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
    }
  ]
}
