#!/usr/bin/env node

import './config';
import { generateSocialMediaContent } from './socialMediaWorkflow';
import promptSync from 'prompt-sync';

const prompt = promptSync();

async function main() {
  console.log('🎨 Social Media Content Generator');
  console.log('==================================');
  console.log('This tool will generate Instagram captions and enhanced images using Gemini Imagen 4\n');

  try {
    // Get user input
    const userPrompt = prompt('Enter your social media scenario: ').trim();
    
    if (!userPrompt) {
      console.log('❌ Please provide a valid prompt');
      process.exit(1);
    }

    console.log('\n🚀 Starting social media content generation...\n');
    
    // Generate content
    const result = await generateSocialMediaContent(userPrompt);
    
    console.log('✅ Social media content generated successfully!');
    console.log('\n📱 Ready to post to Instagram with:');
    console.log(`   • Caption & hashtags`);
    console.log(`   • ${result.imageUrls.length} optimized images`);
    console.log(`   • Enhanced visual composition`);
    
  } catch (error) {
    console.error('\n❌ Error generating social media content:', error);
    console.log('\nTroubleshooting:');
    console.log('• Check your GEMINI_API_KEY environment variable');
    console.log('• Verify SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set');
    console.log('• Ensure you have Gemini API credits available');
    process.exit(1);
  }
}

main();
