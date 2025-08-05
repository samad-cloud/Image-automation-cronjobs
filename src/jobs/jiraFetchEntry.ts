import './config';
import { JiraFetchJob } from './JiraFetchJob';

const job = new JiraFetchJob();
job.execute().catch(console.error); 