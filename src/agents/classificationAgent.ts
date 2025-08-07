import { Agent } from '@openai/agents';
import { SingleProductClassificationSchema } from '../utils/types';

export const classificationAgent = new Agent({
  name: 'Product Classifier',
  model: 'gpt-4o-mini',
  instructions: `
You need to analyse the trigger and determine if it is for a single product or a multi-product campaign.

SINGLE PRODUCT EXAMPLES:
- "FR Back to School theme Photo Calendars" → isSingleProduct: true, productName: "Photo Calendars"
- "UK Summer Sale Photo Mugs" → isSingleProduct: true, productName: "Photo Mugs"
- "US Holiday Canvas Prints" → isSingleProduct: true, productName: "Canvas Prints"
- "Photo Books for Mother's Day" → isSingleProduct: true, productName: "Photo Books"
- "Personalized Photo Calendars" → isSingleProduct: true, productName: "Photo Calendars"

MULTI-PRODUCT EXAMPLES:
- "UK Summer Collection" → isSingleProduct: false, productName: ""
- "Holiday Gift Guide" → isSingleProduct: false, productName: ""
- "Back to School Essentials" → isSingleProduct: false, productName: ""
- "Christmas Gift Ideas" → isSingleProduct: false, productName: ""

RULES:
1. If the trigger mentions a specific product type (like "Photo Calendars", "Photo Mugs", "Canvas Prints", "Photo Books"), it's a single product
2. If the trigger is generic (like "Collection", "Essentials", "Gift Guide"), it's multi-product
3. Even if there are multiple words describing the product (like "Photo Calendars"), if it's one specific product type, it's single product
4. The productName should be the specific product type mentioned, not the full trigger

Return the result in the specified JSON format.
  `,
  outputType: SingleProductClassificationSchema
});
