import { fetchWikiImageInfo } from '../system/agents/MainAgent/tools/wikipedia/wikipediaHelpers.mjs';

async function test() {
  console.log('Testing fetchWikiImageInfo...\n');

  // Test 1: File: prefix (existing style)
  console.log('=== Test 1: With "File:" prefix ===\n');
  const result1 = await fetchWikiImageInfo('File:BBH gravitational lensing of gw150914.webm');
  console.log(JSON.stringify(result1, null, 2));

  // Test 2: Bare file title (no prefix — LLM-friendly)
  console.log('\n=== Test 2: Bare file title (no prefix) ===\n');
  const result2 = await fetchWikiImageInfo('BBH gravitational lensing of gw150914.webm');
  console.log(JSON.stringify(result2, null, 2));

  // Test 3: Known image file
  console.log('\n=== Test 3: Known image file ===\n');
  const result3 = await fetchWikiImageInfo('03 ALBERT EINSTEIN.ogg');
  console.log(JSON.stringify(result3, null, 2));

  // Test 4: Non-existent file
  console.log('\n=== Test 4: Non-existent file ===\n');
  const result4 = await fetchWikiImageInfo('ThisFileDefinitelyDoesNotExist12345.png');
  console.log(result4);

  // Test 5: Already has File: but doesn't exist
  console.log('\n=== Test 5: Non-existent with File: prefix ===\n');
  const result5 = await fetchWikiImageInfo('File:ThisFileDefinitelyDoesNotExist12345.png');
  console.log(result5);
}

test().catch(console.error);
