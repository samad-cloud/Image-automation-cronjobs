import './config';
import { Runner, Agent } from '@openai/agents';
import { classificationAgent } from '../agents/classificationAgent';
import { personaAgent } from '../agents/personaAgent';
import { productAgent } from '../agents/productAgent';
import { cleanProductName, parseProductsFromString } from '../utils/productUtils';
import { SINGLE_STYLE_TO_INSTRUCTIONS, MULTI_STYLE_TO_INSTRUCTIONS, StyleKey } from '../utils/styleMap';
import { 
  ProductDescription, 
  SingleProductClassification, 
  PersonaResponse,
  GeneratedPromptsResponse,
  ImagePromptVariant,
  ImagePromptVariantSchema
} from '../utils/types';

async function getSingleProductDescription(
  runner: Runner,
  productName: string
): Promise<ProductDescription> {
  try {
    console.log(`Searching for product: ${productName}`);
    const response = await runner.run(productAgent, productName);
    return response.finalOutput ?? {
      product_name: productName,
      product_description: 'No description found',
      found: false
    };
  } catch (error) {
    console.error(`Error searching for ${productName}:`, error);
    return {
      product_name: productName,
      product_description: `Error occurred while searching: ${error}`,
      found: false
    };
  }
}

export async function generateImagePrompts(trigger: string) {
  const startTime = Date.now();
  const defaultStyle = 'lifestyle_no_subject,lifestyle_with_subject,lifestyle_emotional';
  const defaultSceneModel = 'o4-mini';
  const runner = new Runner();
  const classify = await runner.run(classificationAgent, trigger);
  const { isSingleProduct, productName } = classify.finalOutput ?? { isSingleProduct: false, productName: '' };

  const personaOutput = await runner.run(personaAgent, trigger);
  const persona = personaOutput.finalOutput?.persona;
  const productList = isSingleProduct
    ? [productName]
    : parseProductsFromString(JSON.stringify(personaOutput.finalOutput)).map(cleanProductName);

  const productDescriptions = await Promise.all(
    productList.map(name =>
      runner.run(productAgent, name).then(r => r.finalOutput)
    )
  );

  // Step 4: Generate prompts for each style
  const styleInstructions = isSingleProduct ? SINGLE_STYLE_TO_INSTRUCTIONS : MULTI_STYLE_TO_INSTRUCTIONS;
  const inputText = `
  PERSONA:
  ${persona}

  PRODUCTS:
  ${productDescriptions
    .filter(desc => desc?.found)
    .map(desc => `Product: ${desc?.product_name}\nComplete Description:\n${desc?.product_description}`)
    .join('\n')}
  `;

  const generatedPrompts: GeneratedPromptsResponse[] = [];
  const styles = defaultStyle.split(',');
  for (const style of styles) {
    const instructions = styleInstructions[style as StyleKey];
    if (!instructions) {
      console.error(`Unknown style: ${style}`);
      continue;
    }

    const agent = new Agent({
      name: `Scene Prompt (${style})`,
      model: defaultSceneModel,
      instructions,
      outputType: ImagePromptVariantSchema
    });

    console.log(`\n=== ${style.replace(/_/g, ' ').toUpperCase()} ===`);
    const result = await runner.run(agent, inputText);
    if (result.finalOutput) {
      generatedPrompts.push({
        style,
        variant: result.finalOutput
      });
      console.log(JSON.stringify(result.finalOutput, null, 2));
    } else {
      console.log('No output generated');
    }
  }

  const totalTime = (Date.now() - startTime) / 1000;  
  console.log(`\nTotal time taken: ${totalTime.toFixed(2)} seconds`);

  return generatedPrompts;
} 