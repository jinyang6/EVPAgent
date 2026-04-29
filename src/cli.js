#!/usr/bin/env node

/**
 * EVPAgent CLI - Simple Node.js readline interface
 *
 * Commands:
 *   /mode              - Show current mode
 *   /mode probe        - Switch to Probe mode (fast, minimal prompt)
 *   /mode rover        - Switch to Rover mode (in-depth, full pipeline)
 *   /reset db          - Clear vector DB cache
 *   /reset prompts     - Reset prompts to default
 *   /reset all         - Reset both
 *   /exit              - Exit CLI
 */

import 'dotenv/config';
import readline from 'readline';
import { SysAgent } from '../system/agents/SysAgent/index.mjs';

// ═══════════════════════════════════════════════════════════════════════════════
// Agent Setup
// ═══════════════════════════════════════════════════════════════════════════════

const sysAgent = new SysAgent();
let currentMode = 'probe';  // Default mode

// ═══════════════════════════════════════════════════════════════════════════════
// CLI Interface
// ═══════════════════════════════════════════════════════════════════════════════

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function print(msg) {
  process.stdout.write(msg + '\n');
}

async function askQuestion() {
  return new Promise((resolve) => {
    rl.question('User: ', (answer) => {
      resolve(answer);
    });
  });
}

async function runQuery(query) {
  let responseBuffer = '';
  let waitingForResponse = false;

  try {
    for await (const chunk of sysAgent.stream(query, currentMode)) {
      // Tool call - print name and params
      if (chunk?.choices?.[0]?.delta?.tool_calls) {
        const tc = chunk.choices[0].delta.tool_calls[0];
        const params = Object.entries(tc.args || {})
          .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
          .join(', ');
        print(`${tc.name}(${params})`);

        // After report tool, next content is the response
        if (tc.name === 'report') {
          waitingForResponse = true;
        }
      }

      // Content - buffer only after report tool
      if (chunk?.choices?.[0]?.delta?.content) {
        const content = chunk.choices[0].delta.content;
        if (waitingForResponse) {
          responseBuffer += content;
          waitingForResponse = false;
        }
      }
    }

    // Print response
    if (responseBuffer) {
      print(`${currentMode}: ${responseBuffer}`);
    } else {
      print(`${currentMode}: (no output)`);
    }
  } catch (error) {
    print(`Error: ${error.message}`);
  }

  // Print stats
  const stats = sysAgent.getStats();
  const total = stats.vectorHits + stats.webRequests;
  if (total > 0) {
    const hitRate = Math.round((stats.vectorHits / total) * 100);
    print(`[Cache: ${hitRate}% (${stats.vectorHits}/${total})]`);
  }
  sysAgent.resetStats();
}

function handleMode(command) {
  const parts = command.toLowerCase().replace('/', '').trim().split(/\s+/);
  const action = parts[0];
  const modeArg = parts[1];

  if (action === 'mode' && !modeArg) {
    print(`Current mode: ${currentMode}`);
    print('  probe: fast search with minimal prompt');
    print('  rover: in-depth search with compose/refine pipeline');
    print('Usage: /mode probe, /mode rover');
  } else if (action === 'mode' && modeArg === 'probe') {
    currentMode = 'probe';
    print('Switched to Probe mode (fast, minimal prompt)');
  } else if (action === 'mode' && modeArg === 'rover') {
    currentMode = 'rover';
    print('Switched to Rover mode (in-depth, full pipeline)');
  } else {
    print('Usage: /mode, /mode probe, or /mode rover');
  }
}

async function handleReset(command) {
  const arg = command.split(' ')[1]?.toLowerCase();

  if (arg === 'db') {
    print('Clearing vector DB...');
    await sysAgent.resetVectorDB();
    print('Vector DB cleared.');
  } else if (arg === 'prompts') {
    print('Resetting prompts to default...');
    sysAgent.resetPrompts();
    print('Prompts reset.');
  } else if (arg === 'all') {
    print('Resetting everything...');
    await sysAgent.resetVectorDB();
    sysAgent.resetPrompts();
    print('All reset complete.');
  } else {
    print('Usage: /reset [db|prompts|all]');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Loop
// ═══════════════════════════════════════════════════════════════════════════════

print('═══════════════════════════════════════════════════════════════');
print('          EVPAgent - Ask questions no one ever asked');
print('═══════════════════════════════════════════════════════════════');
print('Commands: /mode | /reset | /exit\n');

async function main() {
  while (true) {
    const input = await askQuestion();
    const trimmed = input.trim();

    if (!trimmed) continue;

    // Handle commands
    if (trimmed.toLowerCase() === '/exit') {
      print('Goodbye!');
      break;
    }

    if (trimmed.toLowerCase().startsWith('/mode')) {
      handleMode(trimmed);
      print('');
      continue;
    }

    if (trimmed.toLowerCase().startsWith('/reset')) {
      await handleReset(trimmed);
      print('');
      continue;
    }

    await runQuery(trimmed);
    print('');
  }

  rl.close();
}

main();