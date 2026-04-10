/**
 * Test file for searchWikipedia tool
 */

import { searchWikipediaTool } from './agent/tools/searchWikipedia.mjs';

async function test() {
  console.log('=== Test 1: Basic search ===');
  const result1 = await searchWikipediaTool.invoke({ query: 'Mint', limit: 3 });
  console.log(result1);
  console.log('\n---\n');

  console.log('=== Test 2: Search with smaller limit ===');
  const result2 = await searchWikipediaTool.invoke({ query: 'Mars', limit: 2 });
  console.log(result2);
  console.log('\n---\n');

  console.log('=== Test 3: Different topic ===');
  const result3 = await searchWikipediaTool.invoke({ query: 'Quantum computing', limit: 5 });
  console.log(result3);
}

test().catch(console.error);
