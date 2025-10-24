#!/usr/bin/env node

import fetch from 'node-fetch';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY not found in environment');
  process.exit(1);
}

console.log('🔑 Fetching available Gemini models...\n');

const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`;

try {
  const response = await fetch(url);
  const data = await response.json();
  
  console.log('📋 Available models for Live/Streaming:\n');
  
  data.models?.forEach(model => {
    if (model.supportedGenerationMethods?.includes('generateContent') || 
        model.supportedGenerationMethods?.includes('streamGenerateContent')) {
      console.log(`✅ ${model.name}`);
      console.log(`   Display: ${model.displayName}`);
      console.log(`   Methods: ${model.supportedGenerationMethods.join(', ')}`);
      console.log('');
    }
  });
  
  console.log('\n📋 Looking for models with "live" or "flash" in name:\n');
  
  data.models?.forEach(model => {
    const name = model.name.toLowerCase();
    if (name.includes('live') || name.includes('flash') || name.includes('2.0')) {
      console.log(`🎯 ${model.name}`);
      console.log(`   Display: ${model.displayName}`);
      console.log(`   Methods: ${model.supportedGenerationMethods?.join(', ') || 'None listed'}`);
      console.log('');
    }
  });
  
} catch (error) {
  console.error('❌ Error fetching models:', error);
  process.exit(1);
}