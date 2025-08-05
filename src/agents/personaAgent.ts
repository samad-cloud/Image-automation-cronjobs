import { Agent, fileSearchTool } from '@openai/agents';
import { PersonaResponseSchema } from '../utils/types';
import { vectorStoreId } from '../utils/vectorStoreId';

export const personaAgent = new Agent({
  name: 'Persona Selector',
  model: 'gpt-4o',
  instructions: `
1. ONLY use information directly found in the vector store.
2. First, search the vector store for the relevant audience persona for the given region and occasion.
3. Then, search specifically for products that are:
   - Listed in the 'Perfect Products' section for this persona
   - Available in the specified region
   - Suitable for the occasion/season
4. List EXACTLY 3 products that meet these criteria.
6. If you cannot find a product explicitly mentioned in the vector store, DO NOT suggest alternatives.
7. Make Sure to return a complete and detailed Audience persona in the output. Do not summarize the persona.
8. The product names returned should be discrete and to the point.
9. In case you cannot find products for the persona, return Metal Print, Canvas, and Photo Book.
  `,
  outputType: PersonaResponseSchema,
  tools:[
    fileSearchTool(vectorStoreId,{
      maxNumResults: 5,
      includeSearchResults: true,
    })
  ]
});
