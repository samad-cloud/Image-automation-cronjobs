module.exports = {
  apps: [
    {
      name: "jira-fetch",
      script: "npx",
      args: "ts-node src/jobs/jiraFetchEntry.ts",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 5000,
      watch: ["src/jobs/JiraFetchJob.ts"],
      env: {
        NODE_ENV: "development",
        INSTANCE_ID: "fetch-worker"
      }
    },
    {
      name: "event-process",
      script: "npx",
      args: "ts-node src/jobs/eventProcessEntry.ts",
      instances: 2,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 5000,
      watch: ["src/jobs/EventProcessJob.ts"],
      env: {
        NODE_ENV: "development"
      },
      instance_var: "INSTANCE_ID"
    },
    {
      name: "post-process",
      script: "npx",
      args: "ts-node src/jobs/postProcessEntry.ts",
      instances: 1,
      autorestart: false,
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 5000,
      watch: ["src/jobs/PostProcessJob.ts", "src/services/ImageEditService.ts"],
      cron_restart: "*/5 * * * *",
      env: {
        NODE_ENV: "development"
      },
      instance_var: "INSTANCE_ID"
    }
  ]
}