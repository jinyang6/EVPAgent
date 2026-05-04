import { fetchUrlTool } from '../system/agents/MainAgent/tools/web/webFetchTool.mjs';

async function test() {
  console.log('Testing fetchUrlTool...\n');

  // Test 1: Fetch Wikipedia page
  console.log('=== Test 1: Fetch Wikipedia page ===\n');
  try {
    const result1 = await fetchUrlTool.invoke({ url: 'https://riversideca.gov/cedd/sites/riversideca.gov.cedd/files/pdf/planning/historic-preservation/Modernism.pdf' });
    console.log('Result length:', result1.length, 'characters');
    console.log(result1);
  } catch (error) {
    console.error('Error:', error.message);
  }

  // Test 2: Fetch non-Wikipedia page
  console.log('\n=== Test 2: Fetch non-Wikipedia (example.com) ===\n');
  try {
    const result2 = await fetchUrlTool.invoke({ url: 'https://www.bbc.com/travel/article/20191103-the-worlds-oldest-known-recipes-decoded' });
    console.log('Result length:', result2.length, 'characters');
    console.log(result2);
  } catch (error) {
    console.error('Error:', error.message);
  }

  // Test 3: Fetch with invalid URL (should error gracefully)
  console.log('\n=== Test 3: Invalid URL ===\n');
  try {
    const result3 = await fetchUrlTool.invoke({ url: 'https://this-domain-definitely-does-not-exist-12345.com' });
    console.log('Result:', result3);
  } catch (error) {
    console.error('Expected error:', error.message);
  }
}

test().catch(console.error);