import { BaseJob } from './BaseJob'
import axios from 'axios'

export class JiraFetchJob extends BaseJob {
  constructor() {
    super('jira-fetch')
  }

    async execute(): Promise<void> {
    console.log(`[${this.jobName.toUpperCase()}] Starting Jira fetch execution loop...`);
    while (true) {
      try {
        console.log(`[${this.jobName.toUpperCase()}] Starting new fetch cycle...`);
        await this.startRun()

        const jiraUrl = process.env.JIRA_URL
        const username = process.env.JIRA_USERNAME
        const apiToken = process.env.JIRA_API

        console.log(`[${this.jobName.toUpperCase()}] Checking Jira credentials...`);
        if (!jiraUrl || !username || !apiToken) {
          console.error(`[${this.jobName.toUpperCase()}] Missing JIRA credentials:`, {
            jiraUrl: !!jiraUrl,
            username: !!username,
            apiToken: !!apiToken
          });
          throw new Error('Missing JIRA credentials')
        }
        console.log(`[${this.jobName.toUpperCase()}] Jira credentials validated`);

              console.log(`[${this.jobName.toUpperCase()}] Making Jira API request...`);
        const authHeader = `Basic ${Buffer.from(`${username}:${apiToken}`).toString('base64')}`
        const jql = `project = "EMCP" AND issuetype = "Email" AND due > startOfMonth() AND due < endOfMonth()`
        console.log(`[${this.jobName.toUpperCase()}] JQL Query: ${jql}`);

        const response = await axios.post(
          `${jiraUrl}/rest/api/3/search`,
          {
            jql,
            fields: ['summary', 'description', 'duedate', 'issuetype'],
            maxResults: 10
          },
          {
            headers: {
              'Authorization': authHeader,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            }
          }
        )
        console.log(`[${this.jobName.toUpperCase()}] Jira API response received. Issues found: ${response.data.issues?.length || 0}`);

              console.log(`[${this.jobName.toUpperCase()}] Processing ${response.data.issues.length} issues...`);
        for (const issue of response.data.issues) {
          console.log(`[${this.jobName.toUpperCase()}] Processing issue: ${issue.key}`);
          
          try {
            // First check if the event already exists and its status
            const { data: existingEvent } = await this.supabase
              .from('test_calendar_events')
              .select('id, status')
              .eq('jira_id', issue.key)
              .single();

            if (existingEvent) {
              // If event exists and is completed, skip it
              if (existingEvent.status === 'completed') {
                console.log(`[${this.jobName.toUpperCase()}] Skipping completed issue: ${issue.key}`);
                continue;
              }
              // If event exists but not completed, update it
              console.log(`[${this.jobName.toUpperCase()}] Updating existing issue: ${issue.key} (status: ${existingEvent.status})`);
            } else {
              // If event doesn't exist, create it
              console.log(`[${this.jobName.toUpperCase()}] Creating new issue: ${issue.key}`);
            }

            const eventData = this.parseJiraEvent(issue);
            console.log(`[${this.jobName.toUpperCase()}] Parsed event data:`, eventData);
            
            await this.supabase
              .from('test_calendar_events')
              .upsert({
                jira_id: issue.key,
                ...eventData
              }, {
                onConflict: 'jira_id'
              });
            console.log(`[${this.jobName.toUpperCase()}] Successfully upserted issue: ${issue.key}`);
          } catch (error) {
            console.error(`[${this.jobName.toUpperCase()}] Error processing issue ${issue.key}:`, error);
          }
        }

              console.log(`[${this.jobName.toUpperCase()}] Fetch cycle completed successfully`);
        await this.completeRun()
        
        // Wait for 1 hour before next fetch
        console.log(`[${this.jobName.toUpperCase()}] Waiting for 1 hour before next fetch...`);
        await new Promise(resolve => setTimeout(resolve, 60 * 60 * 1000));
      } catch (error) {
        console.error(`[${this.jobName.toUpperCase()}] Error in JiraFetchJob:`, error);
        await this.completeRun(error as Error);
        
        // Wait for 5 minutes before retrying on error
        console.log(`[${this.jobName.toUpperCase()}] Error occurred, retrying in 5 minutes...`);
        await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
      }
    }
  }

  private parseJiraEvent(issue: any) {
    const summary = issue.fields.summary
    const [region, productType, ...rest] = summary.split(' ')
    
    // Filter out unwanted keywords from summary only
    const filteredSummary = this.filterKeywords(issue.fields.summary)
    
    return {
      summary: filteredSummary,
      description: issue.fields.description,
      due_date: issue.fields.duedate,
      region,
      product_type: productType,
      campaign_type: rest.join(' '),
      status: 'pending' as const
    }
  }

  private filterKeywords(text: string): string {
    if (!text) return text

    // Keywords to exclude (case-insensitive)
    const excludePatterns = [
      /\breminder\b/gi,
      /\bre-send\b/gi,
      /\bresend\b/gi,
      /\bv[2-9]\b/gi, // v2, v3, v4, etc.
      /\bday\s+[1-9]\b/gi, // day 1, day 2, day 3, etc.
      /\bafternoon\b/gi,
      /\ba\/b\b/gi,
      /\bab\b/gi,
      /\btbd\b/gi,
      /\bends\s+tonight\b/gi,
      /\breactivation\b/gi,
      /\bcountdown\b/gi,
      /\bdeadline\b/gi,
      /\blast\s+day\b/gi,
      /\([^)]*\)/g, // anything in (brackets)
    ]

    let filteredText = text

    // Apply each pattern
    excludePatterns.forEach(pattern => {
      filteredText = filteredText.replace(pattern, '')
    })

    // Clean up extra whitespace and punctuation
    filteredText = filteredText
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/\s*,\s*/g, ', ') // Clean up commas
      .replace(/\s*\.\s*/g, '. ') // Clean up periods
      .replace(/\s*-\s*/g, ' - ') // Clean up dashes
      .trim()

    return filteredText
  }
}