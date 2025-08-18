import { BaseJob } from './BaseJob'
import { UserCredentials } from '../../supabase/types'
import axios from 'axios'

export class MultiUserJiraFetchJob extends BaseJob {
  constructor(userId?: string) {
    super('jira-fetch', userId)
  }

  async execute(): Promise<void> {
    console.log(`[${this.jobName.toUpperCase()}] Starting Multi-User Jira fetch execution loop...`);
    
    while (true) {
      try {
        console.log(`[${this.jobName.toUpperCase()}] Starting new fetch cycle...`);
        await this.startRun()

        if (this.userId) {
          // Single user mode - process specific user
          await this.processSingleUser(this.userId)
        } else {
          // Multi-user mode - process all users with Jira integrations
          await this.processAllUsers()
        }

        console.log(`[${this.jobName.toUpperCase()}] Fetch cycle completed successfully`);
        await this.completeRun()
        
        // Wait for 1 hour before next fetch
        console.log(`[${this.jobName.toUpperCase()}] Waiting for 1 hour before next fetch...`);
        await new Promise(resolve => setTimeout(resolve, 60 * 60 * 1000));
      } catch (error) {
        console.error(`[${this.jobName.toUpperCase()}] Error in MultiUserJiraFetchJob:`, error);
        await this.completeRun(error as Error);
        
        // Wait for 5 minutes before retrying on error
        console.log(`[${this.jobName.toUpperCase()}] Error occurred, retrying in 5 minutes...`);
        await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
      }
    }
  }

  private async processAllUsers(): Promise<void> {
    console.log(`[${this.jobName.toUpperCase()}] Fetching all users with active Jira integrations...`);
    
    const { data: users, error } = await this.supabase
      .rpc('get_active_jira_users') as { data: any[] | null, error: any }

    if (error) {
      console.error(`[${this.jobName.toUpperCase()}] Error fetching active Jira users:`, error);
      throw error;
    }

    if (!users || users.length === 0) {
      console.log(`[${this.jobName.toUpperCase()}] No active Jira users found`);
      return;
    }

    console.log(`[${this.jobName.toUpperCase()}] Processing ${users.length} users with Jira integrations`);

    // Process users in parallel with controlled concurrency
    const batchSize = 3; // Process 3 users at a time to avoid API rate limits
    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);
      const promises = batch.map((user: any) => 
        this.processSingleUserSafe(user.user_id, {
          user_id: user.user_id,
          jira_config: user.jira_config as any,
          last_synced: user.last_synced
        })
      );
      
      await Promise.allSettled(promises);
      
      // Small delay between batches
      if (i + batchSize < users.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  private async processSingleUserSafe(userId: string, credentials?: UserCredentials): Promise<void> {
    try {
      await this.processSingleUser(userId, credentials);
    } catch (error) {
      console.error(`[${this.jobName.toUpperCase()}] Error processing user ${userId}:`, error);
      // Continue processing other users even if one fails
    }
  }

  private async processSingleUser(userId: string, credentials?: UserCredentials): Promise<void> {
    console.log(`[${this.jobName.toUpperCase()}] Processing Jira integration for user: ${userId}`);

    // Use provided credentials or load from database
    let userCreds = credentials;
    if (!userCreds) {
      if (this.userCredentials && this.userCredentials.user_id === userId) {
        userCreds = this.userCredentials;
      } else {
        // Load credentials for this specific user
        const { data: integration } = await this.supabase
          .from('external_integrations')
          .select('user_id, config, last_synced')
          .eq('user_id', userId)
          .eq('type', 'JIRA')
          .single();

        if (!integration) {
          console.log(`[${this.jobName.toUpperCase()}] No Jira integration found for user: ${userId}`);
          return;
        }

        userCreds = {
          user_id: integration.user_id,
          jira_config: integration.config as any,
          last_synced: integration.last_synced
        };
      }
    }

    if (!userCreds.jira_config) {
      console.log(`[${this.jobName.toUpperCase()}] No Jira config found for user: ${userId}`);
      return;
    }

    const { domain, username, apiKey, projectName, issueType } = userCreds.jira_config;

    console.log(`[${this.jobName.toUpperCase()}] Validating Jira credentials for user: ${userId}...`);
    if (!domain || !username || !apiKey || !projectName || !issueType) {
      console.error(`[${this.jobName.toUpperCase()}] Missing JIRA credentials for user ${userId}:`, {
        domain: !!domain,
        username: !!username,
        apiKey: !!apiKey,
        projectName: !!projectName,
        issueType: !!issueType
      });
      return;
    }

    try {
      // Fetch Jira issues for this user
      await this.fetchJiraIssuesForUser(userId, userCreds.jira_config);
      
      // Update last synced timestamp
      await this.updateLastSynced(userId);
      
      console.log(`[${this.jobName.toUpperCase()}] Successfully processed Jira integration for user: ${userId}`);
    } catch (error) {
      console.error(`[${this.jobName.toUpperCase()}] Error fetching Jira issues for user ${userId}:`, error);
      throw error;
    }
  }

  private async fetchJiraIssuesForUser(userId: string, config: any): Promise<void> {
    const { domain, username, apiKey, projectName, issueType } = config;
    
    // Get user's calendar first to check fetch limit
    const { data: calendar } = await this.supabase
      .from('calendars')
      .select('id, fetch_limit')
      .eq('user_id', userId)
      .eq('provider', 'JIRA')
      .single();

    if (!calendar) {
      console.error(`[${this.jobName.toUpperCase()}] No Jira calendar found for user ${userId}`);
      return;
    }

    // Use user's configured fetch limit (default 200, max 1000)
    const fetchLimit = calendar.fetch_limit || 200;
    console.log(`[${this.jobName.toUpperCase()}] Using fetch limit: ${fetchLimit} for user ${userId}`);
    
    console.log(`[${this.jobName.toUpperCase()}] Making Jira API request for user ${userId}...`);
    const authHeader = `Basic ${Buffer.from(`${username}:${apiKey}`).toString('base64')}`;
    const jql = `project = "${projectName}" AND issuetype = "${issueType}" AND due > startOfMonth() AND due < endOfMonth()`;
    
    console.log(`[${this.jobName.toUpperCase()}] JQL Query for user ${userId}: ${jql}`);

    const response = await axios.post(
      `${domain}/rest/api/3/search`,
      {
        jql,
        fields: ['summary', 'description', 'duedate', 'issuetype'],
        maxResults: fetchLimit
      },
      {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    );

    const issues = response.data.issues || [];
    console.log(`[${this.jobName.toUpperCase()}] Jira API response received for user ${userId}. Issues found: ${issues.length} (limit: ${fetchLimit})`);

    if (issues.length === 0) {
      console.log(`[${this.jobName.toUpperCase()}] No issues found for user ${userId}`);
      return;
    }

    console.log(`[${this.jobName.toUpperCase()}] Processing ${issues.length} issues for user ${userId}...`);
    
    for (const issue of issues) {
      console.log(`[${this.jobName.toUpperCase()}] Processing issue: ${issue.key} for user ${userId}`);
      
      try {
        // Check if the event already exists
        const { data: existingEvent } = await this.supabase
          .from('calendar_events')
          .select('id, status')
          .eq('external_event_id', issue.key)
          .eq('user_id', userId)
          .single();

        if (existingEvent && existingEvent.status === 'completed') {
          console.log(`[${this.jobName.toUpperCase()}] Skipping completed issue: ${issue.key} for user ${userId}`);
          continue;
        }

        const eventData = this.parseJiraEvent(issue, userId, calendar.id);
        console.log(`[${this.jobName.toUpperCase()}] Parsed event data for ${issue.key}:`, {
          summary: eventData.summary,
          due_date: eventData.due_date,
          trigger_start: eventData.trigger_start,
          trigger_end: eventData.trigger_end
        });
        
        await this.supabase
          .from('calendar_events')
          .upsert({
            external_event_id: issue.key,
            user_id: userId,
            calendar_id: calendar.id,
            ...eventData
          }, {
            onConflict: 'external_event_id,user_id'
          });
          
        console.log(`[${this.jobName.toUpperCase()}] Successfully upserted issue: ${issue.key} for user ${userId}`);
      } catch (error) {
        console.error(`[${this.jobName.toUpperCase()}] Error processing issue ${issue.key} for user ${userId}:`, error);
      }
    }
  }

  private parseJiraEvent(issue: any, userId: string, calendarId: string) {
    const summary = issue.fields.summary;
    const dueDate = issue.fields.duedate ? new Date(issue.fields.duedate) : null;
    
    // Calculate trigger times (2 days before due date by default)
    const { trigger_start, trigger_end } = this.calculateTriggerTimes(dueDate);
    
    // Filter out unwanted keywords from summary
    const filteredSummary = this.filterKeywords(summary);
    
    return {
      summary: filteredSummary,
      description: issue.fields.description || null,
      due_date: dueDate ? dueDate.toISOString() : null,
      trigger_start,
      trigger_end,
      raw_data: {
        ...issue,
        fetched_at: new Date().toISOString(),
        user_id: userId
      },
      status: 'pending' as const,
      color: 'amber', // Default color for Jira events
      styles: ['Lifestyle + Subject'], // Default style
      number_of_variations: 1, // Default variations
      tags: []
    };
  }

  private calculateTriggerTimes(dueDate: Date | null): { trigger_start: string | null, trigger_end: string | null } {
    if (!dueDate) return { trigger_start: null, trigger_end: null };
    
    // Calculate trigger date (2 days before due date)
    const triggerDate = new Date(dueDate.getTime() - (2 * 24 * 60 * 60 * 1000));
    
    // Set trigger start to beginning of day (00:00:00 UTC)
    const triggerStart = new Date(triggerDate);
    triggerStart.setUTCHours(0, 0, 0, 0);
    
    // Set trigger end to end of day (23:59:59 UTC)
    const triggerEnd = new Date(triggerDate);
    triggerEnd.setUTCHours(23, 59, 59, 999);
    
    return {
      trigger_start: triggerStart.toISOString(),
      trigger_end: triggerEnd.toISOString()
    };
  }

  private filterKeywords(text: string): string {
    if (!text) return text;

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
    ];

    let filteredText = text;

    // Apply each pattern
    excludePatterns.forEach(pattern => {
      filteredText = filteredText.replace(pattern, '');
    });

    // Clean up extra whitespace and punctuation
    filteredText = filteredText
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/\s*,\s*/g, ', ') // Clean up commas
      .replace(/\s*\.\s*/g, '. ') // Clean up periods
      .replace(/\s*-\s*/g, ' - ') // Clean up dashes
      .trim();

    return filteredText;
  }

  private async updateLastSynced(userId: string): Promise<void> {
    try {
      await this.supabase
        .from('external_integrations')
        .update({
          last_synced: new Date().toISOString().split('T')[0] // Store as date only
        })
        .eq('user_id', userId)
        .eq('type', 'JIRA');
        
      console.log(`[${this.jobName.toUpperCase()}] Updated last_synced for user: ${userId}`);
    } catch (error) {
      console.error(`[${this.jobName.toUpperCase()}] Error updating last_synced for user ${userId}:`, error);
    }
  }
}
