module.exports = {
  apps: [
    {
      name: "jira-fetch",
      script: "ts-node",
      args: "src/jobs/JiraFetchJob.ts",
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
      script: "ts-node",
      args: "src/jobs/EventProcessJob.ts",
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
    }
  ]
}