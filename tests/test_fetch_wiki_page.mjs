import { fetchWikiPageTool } from '../system/agents/MainAgent/tools/wikipedia/fetchWikiPage.mjs';

async function test() {
  console.log('Testing fetchWikiPage...\n');

  // Test 1: Get overview + sections
  console.log('=== Test 1: Overview + Sections ===\n');
  const result1 = await fetchWikiPageTool.invoke({ page: 'Art Deco', useCache: false });
  console.log(result1);

  console.log('\n=== Test 2: Section 2 ===\n');
  const result2 = await fetchWikiPageTool.invoke({ page: 'Art_Deco', sectionIndex: 3, useCache: false });
  console.log(result2);
}

test().catch(console.error);
