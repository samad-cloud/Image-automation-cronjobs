#!/bin/bash

# Start CSV Processing Job Script
# This script can be used to manually start CSV processing jobs for testing

echo "🚀 Starting CSV Processing Jobs..."

echo "Choose an option:"
echo "1. Start global CSV processing (all users, all batches)"
echo "2. Start CSV processing for specific user"
echo "3. Start CSV processing for specific batch"
echo "4. Start multi-user CSV processing with PM2"

read -p "Enter your choice (1-4): " choice

case $choice in
  1)
    echo "Starting global CSV processing..."
    npx ts-node src/jobs/multiUserCsvProcessEntry.ts
    ;;
  2)
    read -p "Enter User ID: " user_id
    echo "Starting CSV processing for user: $user_id"
    CSV_USER_ID=$user_id npx ts-node src/jobs/csvProcessEntry.ts
    ;;
  3)
    read -p "Enter User ID: " user_id
    read -p "Enter Batch ID: " batch_id
    echo "Starting CSV processing for batch: $batch_id (user: $user_id)"
    CSV_USER_ID=$user_id CSV_BATCH_ID=$batch_id npx ts-node src/jobs/csvProcessEntry.ts
    ;;
  4)
    echo "Starting CSV processing with PM2..."
    pm2 start ecosystem.multiuser.config.js --only multi-user-csv-process-backup
    pm2 logs multi-user-csv-process-backup
    ;;
  *)
    echo "Invalid choice. Exiting..."
    exit 1
    ;;
esac
