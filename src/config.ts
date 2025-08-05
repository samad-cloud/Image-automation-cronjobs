import { setDefaultOpenAIKey } from '@openai/agents';
import * as dotenv from 'dotenv';
dotenv.config();
setDefaultOpenAIKey(process.env.OPENAI_API_KEY!);
