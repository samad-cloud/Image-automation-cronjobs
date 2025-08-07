import './config';
import { Runner, Agent } from '@openai/agents';
import { classificationAgent } from './agents/classificationAgent';
import { personaAgent } from './agents/personaAgent';
import { productAgent } from './agents/productAgent';
import { cleanProductName, parseProductsFromString } from './utils/productUtils';
import { SINGLE_STYLE_TO_INSTRUCTIONS, MULTI_STYLE_TO_INSTRUCTIONS, StyleKey } from './utils/styleMap';
import { 
  ProductDescription, 
  SingleProductClassification, 
  PersonaResponse,
  GeneratedPromptsResponse,
  ImagePromptVariant,
  ImagePromptVariantSchema
} from './utils/types';
import promptSync from 'prompt-sync';

const prompt = promptSync();

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

async function main() {
  const startTime = Date.now();
  try {
    // Get user input
    const trigger = prompt('Enter trigger: ').trim();
    const sceneModel =  'o4-mini';
    const styles = prompt('Enter style(s) separated by comma (e.g., lifestyle_no_subject, studio): ')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean) as StyleKey[];

    // Initialize runner
    const runner = new Runner();

    // Step 1: Classify if single product
    console.log('\n=== Step 1: Product Classification ===');
    const classify = await runner.run(classificationAgent, trigger);
    // console.log('Raw classification response:', JSON.stringify(classify, null, 2));
    const { isSingleProduct, productName } = classify.finalOutput ?? { isSingleProduct: false, productName: '' };
    console.log('isSingleProduct:', isSingleProduct);
    console.log('productName:', productName);

    let persona: string;
    let productDescriptions: ProductDescription[] = [];

    if (isSingleProduct) {
      // Step 2: Get persona for single product
      const personaOutput = await runner.run(personaAgent, trigger);
      persona = personaOutput.finalOutput?.persona ?? '';
      console.log('\n=== Step 2: Persona Selection ===');
      console.log('Persona:', persona);

      // Step 3: Get product description
      const cleanedProductName = cleanProductName(productName);
      const productDesc = await getSingleProductDescription(runner, cleanedProductName + " Description");
      console.log(`\n=== Step 3: Product Description for '${productName}' ===`);
      console.log('Found:', productDesc.found);
      console.log('Description:', productDesc.product_description);
      productDescriptions = [productDesc];
    } else {
      // Step 2: Get persona and products for multi-product
      const personaOutput = await runner.run(personaAgent, trigger);
      const personaResponse = personaOutput.finalOutput as PersonaResponse;
      persona = personaResponse.persona;
      const products = personaResponse.products;
      
      console.log('\n=== Step 2: Persona and Product Selection ===');
      console.log('Persona:', persona);
      console.log('Products:', products);

      // Step 3: Get descriptions for all products
      const cleanedProducts = products.map(p => {
        // Remove numbering (e.g., "1. ") and clean the product name
        const withoutNumbering = p.replace(/^\d+\.\s*/, '');
        return cleanProductName(withoutNumbering);
      });
      productDescriptions = await Promise.all(
        cleanedProducts.map((p: string) => getSingleProductDescription(runner, p + " Description"))
      );
      
      console.log('\n=== Step 3: Product Descriptions ===');
      productDescriptions.forEach(desc => {
        console.log(`Product: ${desc.product_name}`);
        console.log(`Found: ${desc.found}`);
        console.log(`Description: ${desc.product_description}\n`);
      });
    }

    // Step 4: Generate prompts for each style
    const styleInstructions = isSingleProduct ? SINGLE_STYLE_TO_INSTRUCTIONS : MULTI_STYLE_TO_INSTRUCTIONS;
    const inputText = `
TRIGGER:
${trigger}

PERSONA:
${persona}

PRODUCTS:
${productDescriptions
  .filter(desc => desc.found)
  .map(desc => `Product: ${desc.product_name}\nComplete Description:\n${desc.product_description}`)
  .join('\n')}
`;

    const generatedPrompts: GeneratedPromptsResponse[] = [];

    for (const style of styles) {
      const instructions = styleInstructions[style];
      if (!instructions) {
        console.error(`Unknown style: ${style}`);
        continue;
      }

      const agent = new Agent({
        name: `Scene Prompt (${style})`,
        model: sceneModel,
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
  } catch (error) {
    console.error('\nError in main execution:', error);
  }
}

main();