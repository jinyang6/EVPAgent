import { searchWikipediaTool } from '../system/agents/MainAgent/tools/wikipedia/searchWikipedia.mjs';

async function test() {
  console.log('Testing searchWikipedia...\n');

  // Test 1: Basic search
  console.log('=== Test 1: Basic Search ===\n');
  const result1 = await searchWikipediaTool.invoke({ query: 'Why is there anything', limit: 3 });
  console.log(result1);

  // Test 2: Nearmatch search
  console.log('\n=== Test 2: Nearmatch Search ===\n');
  const result2 = await searchWikipediaTool.invoke({ query: 'Eal', limit: 3, type: 'nearmatch' });
  console.log(result2);

  // Test 3: Exact phrase
  console.log('\n=== Test 3: Exact Phrase ===\n');
  const result3 = await searchWikipediaTool.invoke({ query: '"machine learning"', limit: 3 });
  console.log(result3);

  // Test 4: Boolean operators
  console.log('\n=== Test 4: Boolean Search ===\n');
  const result4 = await searchWikipediaTool.invoke({ query: 'Mars AND ocean NOT river', limit: 3 });
  console.log(result4);

  // Test 5: Perseverance rover search
  console.log('\n=== Test 5: Perseverance Rover ===\n');
  const result5 = await searchWikipediaTool.invoke({ query: 'Perseverance rover', limit: 5 });
  console.log(result5);
}

test().catch(console.error);