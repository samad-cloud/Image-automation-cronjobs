import { BaseJob } from './BaseJob'
import axios from 'axios'

export class JiraFetchJob extends BaseJob {
  constructor() {
    super('jira-fetch')
  }

  async execute(): Promise<void> {
    while (true) {
      try {
      await this.startRun()

      const jiraUrl = process.env.JIRA_URL
      const username = process.env.JIRA_USERNAME
      const apiToken = process.env.JIRA_API

      if (!jiraUrl || !username || !apiToken) {
        throw new Error('Missing JIRA credentials')
      }

      const authHeader = `Basic ${Buffer.from(`${username}:${apiToken}`).toString('base64')}`
      const jql = `project = "EMCP" AND issuetype = "Email" AND due > startOfMonth() AND due < endOfMonth()`

      const response = await axios.post(
        `${jiraUrl}/rest/api/3/search`,
        {
          jql,
          fields: ['summary', 'description', 'duedate', 'issuetype']
        },
        {
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        }
      )

      for (const issue of response.data.issues) {
        const eventData = this.parseJiraEvent(issue)
        
        await this.supabase
          .from('test_calendar_events')
          .upsert({
            jira_id: issue.key,
            ...eventData
          }, {
            onConflict: 'jira_id'
          })
      }

      await this.completeRun()
      
      // Wait for 1 hour before next fetch
      console.log('Waiting for 1 hour before next fetch...');
      await new Promise(resolve => setTimeout(resolve, 60 * 60 * 1000));
    } catch (error) {
      console.error('Error in JiraFetchJob:', error);
      await this.completeRun(error as Error);
      
      // Wait for 5 minutes before retrying on error
      console.log('Error occurred, retrying in 5 minutes...');
      await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
    }
    }
  }

  private parseJiraEvent(issue: any) {
    const summary = issue.fields.summary
    const [region, productType, ...rest] = summary.split(' ')
    
    return {
      summary: issue.fields.summary,
      description: issue.fields.description,
      due_date: issue.fields.duedate,
      region,
      product_type: productType,
      campaign_type: rest.join(' '),
      status: 'pending' as const
    }
  }
}