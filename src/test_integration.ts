// test_integration.ts
// Test script to demonstrate the integrated workflow

import { generateImagePrompts } from './index';
import { processSingleRow } from './integrated_csv_workflow';

async function testIntegratedWorkflow() {
  console.log('🧪 Testing Integrated CSV Workflow...\n');

  try {
    // Test 1: Direct trigger test with country, product type, MPN, and size
    console.log('=== Test 1: Direct Trigger Test ===');
    const testTrigger = `
Country: United Kingdom
Product Type: Canvas
MPN: CANVAS-20X30-PREMIUM
Size: 20x30 inches
Title: Premium Canvas Print - Landscape Photography
Description: High-quality canvas print perfect for home decoration, featuring vibrant colors and durable materials
`;

    console.log('🎯 Testing trigger:', testTrigger.substring(0, 100) + '...');
    const directResult = await generateImagePrompts(testTrigger);
    
    console.log(`✅ Direct test completed successfully!`);
    console.log(`   Generated ${directResult.length} prompt variants`);
    directResult.forEach((prompt, index) => {
      console.log(`   ${index + 1}. ${prompt.style}: ${prompt.variant?.scene?.substring(0, 80)}...`);
    });

    // Test 2: Single row processing test
    console.log('\n=== Test 2: Single Row Processing ===');
    const singleRowResult = await processSingleRow(
      'Germany',
      'PhotoBook', 
      'PHOTOBOOK-A4-HARDCOVER',
      'A4 Hardcover',
      {
        title: 'Professional Photo Book - Wedding Collection',
        description: 'Premium hardcover photo book with high-quality photo paper, perfect for preserving wedding memories'
      }
    );

    console.log(`✅ Single row test completed successfully!`);
    console.log(`   Processing time: ${singleRowResult.processingTime.toFixed(2)}s`);
    console.log(`   Generated ${singleRowResult.generatedPrompts.length} prompt variants`);

    // Test 3: Various country/product combinations
    console.log('\n=== Test 3: Multiple Scenarios ===');
    const testScenarios = [
      { country: 'France', productType: 'Mug', mpn: 'MUG-CERAMIC-11OZ', size: '11 oz' },
      { country: 'Japan', productType: 'Cushion', mpn: 'CUSHION-SQUARE-45CM', size: '45x45 cm' },
      { country: 'Australia', productType: 'Calendar', mpn: 'WALL-CAL-2025', size: 'A3 Wall Calendar' }
    ];

    for (const scenario of testScenarios) {
      console.log(`\n🔄 Testing: ${scenario.country} | ${scenario.productType} | ${scenario.mpn}`);
      const scenarioTrigger = `
Country: ${scenario.country}
Product Type: ${scenario.productType}
MPN: ${scenario.mpn}
Size: ${scenario.size}
Title: Premium ${scenario.productType} - High Quality Print
Description: Professional quality ${scenario.productType} with excellent durability and vibrant colors
`;
      
      const scenarioResult = await generateImagePrompts(scenarioTrigger);
      console.log(`   ✅ Generated ${scenarioResult.length} variants`);
      
      // Show first variant as example
      if (scenarioResult.length > 0) {
        console.log(`   Example (${scenarioResult[0].style}): ${scenarioResult[0].variant?.scene?.substring(0, 60)}...`);
      }
    }

    console.log('\n🎉 All integration tests completed successfully!');
    console.log('\n📋 Summary:');
    console.log('   ✓ Direct trigger processing works');
    console.log('   ✓ Single row processing works');
    console.log('   ✓ Multiple country/product scenarios work');
    console.log('   ✓ Integration with existing index.ts flow successful');

  } catch (error) {
    console.error('❌ Integration test failed:', error);
    throw error;
  }
}

// Export for use in other modules
export { testIntegratedWorkflow };

// Run if this file is executed directly
if (require.main === module) {
  testIntegratedWorkflow()
    .then(() => {
      console.log('\n✅ Test script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Test script failed:', error);
      process.exit(1);
    });
}
