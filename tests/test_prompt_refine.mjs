import { deletePromptTool } from '../system/agents/PromptRefineAgent/tools/delete/deletePrompt.mjs';
import { listPromptFilesTool } from '../system/agents/PromptRefineAgent/tools/list/listPromptFiles.mjs';
import { readPromptTool } from '../system/agents/PromptRefineAgent/tools/read/readPrompt.mjs';
import { readSessionManifestTool } from '../system/agents/PromptRefineAgent/tools/read/readSessionManifest.mjs';
import { readSystemPromptTool } from '../system/agents/PromptRefineAgent/tools/read/readSystemPrompt.mjs';
import { writePromptTool } from '../system/agents/PromptRefineAgent/tools/write/writePrompt.mjs';

async function test() {
  console.log('Testing PromptRefineAgent tools...\n');

  // Test 1: List Rephrase prompts
  console.log('=== Test 1: listPromptFilesTool (Rephrase) ===\n');
  try {
    const result1 = await listPromptFilesTool.invoke({ folder: 'Rephrase' });
    const parsed = JSON.parse(result1);
    console.log('Found', parsed.length, 'Rephrase prompts:');
    parsed.forEach(f => console.log(`  - ${f.name}: ${f.description || '(no description)'}`));
  } catch (error) {
    console.error('Error:', error.message);
  }

  // Test 2: List Loop prompts
  console.log('\n=== Test 2: listPromptFilesTool (Loop) ===\n');
  try {
    const result2 = await listPromptFilesTool.invoke({ folder: 'Loop' });
    const parsed = JSON.parse(result2);
    console.log('Found', parsed.length, 'Loop prompts:');
    parsed.forEach(f => console.log(`  - ${f.name}: ${f.description || '(no description)'}`));
  } catch (error) {
    console.error('Error:', error.message);
  }

  // Test 3: Read a specific prompt (Rephrase default)
  console.log('\n=== Test 3: readPromptTool (Rephrase/default) ===\n');
  try {
    const result3 = await readPromptTool.invoke({ prompt: { section: 'Rephrase', promptName: 'default' } });
    const parsed = JSON.parse(result3);
    console.log('Read prompt:', parsed.name);
    console.log('Description:', parsed.description || '(none)');
    console.log('Content preview:', parsed.content?.substring(0, 100) || '(empty)', '...');
  } catch (error) {
    console.error('Error:', error.message);
  }

  // Test 4: Read session manifest
  console.log('\n=== Test 4: readSessionManifestTool ===\n');
  try {
    const result4 = await readSessionManifestTool.invoke({});
    const parsed = JSON.parse(result4);
    console.log('Session manifest:');
    console.log('  - User query:', parsed.userQuery || '(none)');
    console.log('  - Prompts used:', parsed.promptsUsed?.length || 0);
    console.log('  - Search history:', parsed.searchHistory?.length || 0);
    console.log('  - Search success:', parsed.searchSuccess);
  } catch (error) {
    console.error('Error:', error.message);
  }

  // Test 5: Read system prompt
  console.log('\n=== Test 5: readSystemPromptTool ===\n');
  try {
    const result5 = await readSystemPromptTool.invoke({});
    console.log('System prompt length:', result5.length, 'characters');
    console.log('First 150 chars:', result5.substring(0, 150));
  } catch (error) {
    console.error('Error:', error.message);
  }

  // Test 6: Write a new prompt
  console.log('\n=== Test 6: writePromptTool ===\n');
  try {
    const result6 = await writePromptTool.invoke({
      prompt: {
        section: 'Rephrase',
        promptName: 'test_prompt',
        description: 'Test prompt created at ' + new Date().toISOString(),
        content: '# Test Prompt\n\nThis is a test prompt for testing purposes.'
      }
    });
    console.log('Write result:', result6);
  } catch (error) {
    console.error('Error:', error.message);
  }

  // Test 7: Read the newly created prompt
  console.log('\n=== Test 7: readPromptTool (test_prompt) ===\n');
  try {
    const result7 = await readPromptTool.invoke({ prompt: { section: 'Rephrase', promptName: 'test_prompt' } });
    const parsed = JSON.parse(result7);
    console.log('Read prompt:', parsed.name);
    console.log('Description:', parsed.description);
    console.log('Content:', parsed.content);
  } catch (error) {
    console.error('Error:', error.message);
  }

  // Test 8: Delete the test prompt
  console.log('\n=== Test 8: deletePromptTool ===\n');
  try {
    const result8 = await deletePromptTool.invoke({ prompt: { section: 'Rephrase', promptName: 'test_prompt' } });
    console.log('Delete result:', result8);
  } catch (error) {
    console.error('Error:', error.message);
  }

  // Test 9: Try to read deleted prompt (should fail)
  console.log('\n=== Test 9: Verify deletion ===\n');
  try {
    const result9 = await readPromptTool.invoke({ prompt: { section: 'Rephrase', promptName: 'test_prompt' } });
    console.log('Read after delete:', result9);
  } catch (error) {
    console.error('Expected error:', error.message);
  }

  // Test 10: Try to delete default prompt (should fail)
  console.log('\n=== Test 10: Cannot delete default ===\n');
  try {
    const result10 = await deletePromptTool.invoke({ prompt: { section: 'Rephrase', promptName: 'default' } });
    console.log('Delete default result:', result10);
  } catch (error) {
    console.error('Error:', error.message);
  }

  console.log('\n=== All tests complete ===');
}

test().catch(console.error);