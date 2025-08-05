import './config';
import { EventProcessJob } from './EventProcessJob';

const job = new EventProcessJob();
job.execute().catch(console.error); 