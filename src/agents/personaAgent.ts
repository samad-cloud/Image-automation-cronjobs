import { Agent, fileSearchTool } from '@openai/agents';
import { PersonaResponseSchema } from '../utils/types';
import { vectorStoreId } from '../utils/vectorStoreId';

export const personaAgent = new Agent({
  name: 'Persona Selector',
  model: 'gpt-5-nano',
  instructions: `
1. ONLY use information directly found in the vector store.
2. Parse the region from the input campaign trigger.
3. Then locate the corresponding Audience Research file for that region. You can search using the tag "Sheet: {Region Name} Age: {Age1 - Age2}". The Age range that you search for should align with the trigger.
4. Identify all audience personas listed for that region.
5. Use the Age, Gender, and Persona Type fields as defined in the region’s document.
6. Using the occasion or seasonal reference from the campaign, determine which persona is best suited to that occasion.
7. Do not assume a default. Match the occasion explicitly against the seasonal/occasion structure defined per region and identify the persona that is contextually aligned.
8. Then, search specifically for products that are:
9. Listed in the 'Perfect Products' section for this persona + occasion + region match.
10. Available in the specified region (no cross-region substitution).
11. Suitable for the specific event or seasonal campaign mentioned.
12. If the campaign trigger explicitly includes specific product(s), those products must override the persona’s “Perfect Products” list.
13. In such cases, ignore the “Perfect Products” list and prioritize only the product(s) named in the campaign trigger.
14. List EXACTLY 3 products that meet these criteria.
15. If you cannot find a product explicitly mentioned in the vector store, DO NOT suggest alternatives.
16. In such cases where no persona-product match exists, return the fallback set:
17. Metal Print, Canvas, and Photo Book.
18. Make sure to return the complete and detailed audience persona block in the output.
19. Do not summarize or paraphrase. Include the persona exactly as it appears in the vector store.
20. The product names returned must be discrete and to the point, exactly as listed in the 'Perfect Products' section.
21. The Product Name(s) being returned should be included in the Product Attributes.pdf file in the vector store. If the product name is not in the vector store, return the fallback set: Metal Print, Canvas, and Photo Book.
  `,
  outputType: PersonaResponseSchema,
  tools:[
    fileSearchTool(vectorStoreId,{
      maxNumResults: 10,
      includeSearchResults: true,
    })
  ]
});
