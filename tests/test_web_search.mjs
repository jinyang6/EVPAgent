import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { webSearchTool } from '../system/agents/MainAgent/tools/web/webSearchTool.mjs';

// Fix: dotenv loads from project root, not tests folder
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: join(__dirname, '..', '.env') });

console.log('EXA_API_KEY:', process.env.EXA_API_KEY ? 'loaded' : 'NOT LOADED');

async function test() {
  console.log('Testing webSearchTool (Exa)...\n');

  // Test 1: Basic search
  console.log('=== Test 1: Basic search (count=3) ===\n');
  try {
    const result1 = await webSearchTool.invoke({ query: 'hall effect thruster efficiency', count: 3 });
    console.log('Result length:', result1.length, 'characters');
    console.log(result1);
  } catch (error) {
    console.error('Error:', error.message);
  }

  // Test 2: Search with include (restrict to specific sites)
  console.log('\n=== Test 2: Search with include ===\n');
  try {
    const result2 = await webSearchTool.invoke({ query: 'context engineering development history', count: 3, include: 'bbc.com,cnn.com' });
    console.log('Result length:', result2.length, 'characters');
    console.log(result2);
  } catch (error) {
    console.error('Error:', error.message);
  }

  // Test 3: Search with exclude (exclude Wikipedia)
  console.log('\n=== Test 3: Search with exclude ===\n');
  try {
    const result3 = await webSearchTool.invoke({ query: 'Mars tide possibility', count: 3, exclude: 'wikipedia.org' });
    console.log('Result length:', result3.length, 'characters');
    console.log(result3);
  } catch (error) {
    console.error('Error:', error.message);
  }

  // Test 4: Search with all params (include + exclude)
  console.log('\n=== Test 4: Search with include + exclude ===\n');
  try {
    const result4 = await webSearchTool.invoke({
      query: 'starship superheavy development roadmap',
      count: 5,
      include: 'bbc.com',
      exclude: 'wikipedia.org'
    });
    console.log('Result length:', result4.length, 'characters');
    console.log(result4);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

test().catch(console.error);