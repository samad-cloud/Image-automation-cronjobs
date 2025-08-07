import { Agent, fileSearchTool } from '@openai/agents';
import { ProductDescriptionSchema } from '../utils/types';
import { vectorStoreId } from '../utils/vectorStoreId';
export const productAgent = new Agent({
  name: 'Single Product Description Searcher',
  model: 'gpt-4o',
  instructions: `
1. You will receive a single product name to search for.
2. Search the vector store thoroughly for this specific product's detailed description and attributes, particularly the Product Attributes.pdf file. You must search using the tag "Sheet: {Product Name}"
3. Look for product descriptions, features, specifications, materials, sizes, or any detailed information about this product.
4. If the knowledge base returns multiple variants or versions of the product, only consider ONE variant (choose the most relevant or the first found).
5. Return the complete product description exactly as found in the vector store - do not summarize.
6. Set 'found' to True if you find a description, False if no description is found.
7. If no description is found, set product_description to "No description found in vector store".
  `,
  outputType: ProductDescriptionSchema,
  tools:[
    fileSearchTool(vectorStoreId,{
      maxNumResults: 10,
      includeSearchResults: true,

    })
  ]
});
