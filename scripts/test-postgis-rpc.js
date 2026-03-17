#!/usr/bin/env node

/**
 * Test script to verify the get_upload_context RPC function
 * 
 * Test Cases:
 * 1. Direct Match: 31.6295, -7.9811 (Morocco)
 * 2. Nearby Crag: 35.9123, -5.4321 (nearby to a known crag)
 * 3. Coastal Edge: 43.3214, 1.9876 (Marseille area)
 */

import { createClient } from '@supabase/supabase-js';

// Configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'anonymous';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Test coordinates
const testCases = [
  {
    name: 'Direct Match (Morocco)',
    lat: 31.6295,
    lng: -7.9811,
    expectedRegion: 'MA'
  },
  {
    name: 'Nearby Crag (Spain)',
    lat: 35.9123,
    lng: -5.4321,
    expectedRegion: 'ES'
  },
  {
    name: 'Coastal Edge (France)',
    lat: 43.3214,
    lng: 1.9876,
    expectedRegion: 'FR'
  }
];

async function runTests() {
  console.log('Testing get_upload_context RPC function...\n');
  
  for (const testCase of testCases) {
    console.log(`Test: ${testCase.name}`);
    console.log(`Coordinates: ${testCase.lat}, ${testCase.lng}`);
    
    try {
      const { data, error } = await supabase
        .rpc('get_upload_context', {
          search_lat: testCase.lat,
          search_lng: testCase.lng
        });
      
      if (error) {
        console.log(`❌ Error: ${error.message}`);
      } else {
        console.log(`✅ Success`);
        console.log(`   Region: ${data?.region?.name || 'null'}`);
        console.log(`   Country Code: ${data?.region?.country_code || 'null'}`);
        console.log(`   Crag: ${data?.crag?.name || 'null'}`);
        
        if (data?.region?.country_code === testCase.expectedRegion) {
          console.log(`   ✓ Correct country code`);
        } else {
          console.log(`   ✗ Expected ${testCase.expectedRegion}, got ${data?.region?.country_code || 'null'}`);
        }
      }
    } catch (err) {
      console.log(`❌ Exception: ${err.message}`);
    }
    
    console.log('---\n');
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error);
}

export { runTests };