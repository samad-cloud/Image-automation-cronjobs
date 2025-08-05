import { Agent } from '@openai/agents';
import { SingleProductClassificationSchema } from '../utils/types';

export const classificationAgent = new Agent({
  name: 'Product Classifier',
  model: 'gpt-4o-mini',
  instructions: `
You need to analyse the trigger and determine if it is for a single product or a multi-product. Return True if it is for a single product, False if it is for a multi-product. Also return the product name if it is for a single product.
  `,
  outputType: SingleProductClassificationSchema
});
