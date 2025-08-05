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
  console.log('[AGENT-WORKFLOW] Starting image prompt generation...');
  console.log('[AGENT-WORKFLOW] Trigger:', trigger);
  
  const startTime = Date.now();
  const defaultStyle = 'lifestyle_no_subject,lifestyle_with_subject,lifestyle_emotional';
  const defaultSceneModel = 'o4-mini';
  const runner = new Runner();
  
  console.log('[AGENT-WORKFLOW] Running classification agent...');
  const classify = await runner.run(classificationAgent, trigger);
  const { isSingleProduct, productName } = classify.finalOutput ?? { isSingleProduct: false, productName: '' };
  console.log('[AGENT-WORKFLOW] Classification result:', { isSingleProduct, productName });

  console.log('[AGENT-WORKFLOW] Running persona agent...');
  const personaOutput = await runner.run(personaAgent, trigger);
  const persona = personaOutput.finalOutput?.persona;
  console.log('[AGENT-WORKFLOW] Persona result:', persona);
  
  const productList = isSingleProduct
    ? [productName]
    : parseProductsFromString(JSON.stringify(personaOutput.finalOutput)).map(cleanProductName);
  console.log('[AGENT-WORKFLOW] Product list:', productList);

  console.log('[AGENT-WORKFLOW] Getting product descriptions...');
  const productDescriptions = await Promise.all(
    productList.map(async (name, index) => {
      console.log(`[AGENT-WORKFLOW] Getting description for product ${index + 1}/${productList.length}: ${name}`);
      const result = await runner.run(productAgent, name);
      console.log(`[AGENT-WORKFLOW] Product description result for ${name}:`, result.finalOutput);
      return result.finalOutput;
    })
  );
  console.log('[AGENT-WORKFLOW] All product descriptions retrieved');

  // Step 4: Generate prompts for each style
  console.log('[AGENT-WORKFLOW] Starting prompt generation for different styles...');
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
  console.log('[AGENT-WORKFLOW] Input text prepared for prompt generation');

  const generatedPrompts: GeneratedPromptsResponse[] = [];
  const styles = defaultStyle.split(',');
  console.log('[AGENT-WORKFLOW] Styles to process:', styles);
  
  for (const style of styles) {
    console.log(`[AGENT-WORKFLOW] Processing style: ${style}`);
    const instructions = styleInstructions[style as StyleKey];
    if (!instructions) {
      console.error(`[AGENT-WORKFLOW] Unknown style: ${style}`);
      continue;
    }

    const agent = new Agent({
      name: `Scene Prompt (${style})`,
      model: defaultSceneModel,
      instructions,
      outputType: ImagePromptVariantSchema
    });

    console.log(`[AGENT-WORKFLOW] Running agent for style: ${style}`);
    const result = await runner.run(agent, inputText);
    if (result.finalOutput) {
      generatedPrompts.push({
        style,
        variant: result.finalOutput
      });
      console.log(`[AGENT-WORKFLOW] Successfully generated prompt for style: ${style}`);
    } else {
      console.log(`[AGENT-WORKFLOW] No output generated for style: ${style}`);
    }
  }

  const totalTime = (Date.now() - startTime) / 1000;  
  console.log(`[AGENT-WORKFLOW] Total time taken: ${totalTime.toFixed(2)} seconds`);
  console.log(`[AGENT-WORKFLOW] Generated ${generatedPrompts.length} prompts successfully`);

  return generatedPrompts;
} 