import { readSystemPromptTool } from '../system/agents/PromptComposerAgent/tools/read/readSystemPrompt.mjs';
import { listPromptFilesTool } from '../system/agents/PromptComposerAgent/tools/list/listPromptFiles.mjs';

async function test() {
  console.log('Testing PromptComposerAgent tools...\n');

  // Test 1: Read system prompt
  console.log('=== Test 1: readSystemPromptTool ===\n');
  try {
    const result1 = await readSystemPromptTool.invoke({});
    console.log('Success: readSystemPromptTool returned', result1.length, 'characters');
    console.log('First 200 chars:', result1.substring(0, 200));
  } catch (error) {
    console.error('Error:', error.message);
  }

  // Test 2: List prompt files
  console.log('\n=== Test 2: listPromptFilesTool ===\n');
  try {
    const result2 = await listPromptFilesTool.invoke({});
    console.log('Success: listPromptFilesTool returned:');
    const parsed = JSON.parse(result2);
    console.log('Found', parsed.length, 'prompt files:');
    parsed.forEach(f => {
      console.log(`  - [${f.section}] ${f.name}: ${f.description || '(no description)'}`);
    });
  } catch (error) {
    console.error('Error:', error.message);
  }
}

test().catch(console.error);