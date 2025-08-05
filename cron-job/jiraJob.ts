import cron from 'node-cron';
import * as dotenv from 'dotenv';
import axios from 'axios';
dotenv.config({path: '.env'});

cron.schedule('* * * * *', async () => {
    console.log(`${process.env.JIRA_URL} + ${process.env.JIRA_USERNAME} + ${process.env.JIRA_API}`)
    const jiraUrl = process.env.JIRA_URL;
    const username = process.env.JIRA_USERNAME;
    const apiToken = process.env.JIRA_API;

  if (!jiraUrl || !username || !apiToken) {
    console.error('Missing JIRA credentials in env');
    return;
  }

  const authHeader = `Basic ${Buffer.from(`${username}:${apiToken}`).toString('base64')}`;
//   console.log('Using Auth:', authHeader);

  try {
    const testRes = await axios.get(`${jiraUrl}/rest/api/3/myself`, {
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json'
      }
    });

    if(testRes.status !== 200){
      console.error('JIRA Auth Failed!');
      return;
    }

    console.log('JIRA Auth Success!');
    const jql = `project = "EMCP" AND issuetype = "Email" AND due > startOfMonth() AND due < endOfMonth()`;
    const res = await axios.post(`${jiraUrl}/rest/api/3/search`, {
      jql: jql,
      fields: ['summary', 'description', 'duedate', 'issuetype']
    }, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
    for(const issue of res.data.issues){
      console.log(issue.key + " - " + issue.fields.summary + " - " + issue.fields.duedate);
    }   

  } catch (err) {
    console.error('Unexpected error:', err);
  }
});
