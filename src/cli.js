#!/usr/bin/env node

/**
 * EVPAgent CLI — Readline interface
 *
 * Commands:
 *   /mode              Show current mode
 *   /mode probe|rover  Switch mode
 *   /reset db|prompts|all  Clear data
 *   /exit              Quit
 */

import 'dotenv/config';
import readline from 'readline';
import { marked } from 'marked';
import { markedTerminal } from 'marked-terminal';
import { SysAgent } from '../system/agents/SysAgent/index.mjs';

marked.use(markedTerminal());

// ═══════════════════════════════════════════════════════════════════════════════
// Setup
// ═══════════════════════════════════════════════════════════════════════════════

const sysAgent = new SysAgent();
let mode = 'probe';
const chatHistory = [];

// ANSI color helpers
const C = (code, s) => `\x1b[${code}m${s}\x1b[0m`;
const bold = s => C(1, s);
const cyan = s => C(36, s);
const green = s => C(32, s);
const yellow = s => C(33, s);
const dim = s => C(2, s);
const modeLabel = { probe: green('PROBE'), rover: yellow('ROVER') };
const userLabel = cyan('User');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = () => new Promise(resolve => rl.question(`${userLabel}: `, resolve));

// ═══════════════════════════════════════════════════════════════════════════════
// Handlers
// ═══════════════════════════════════════════════════════════════════════════════

async function runQuery(query) {
  chatHistory.push({ role: "user", content: query });
  let response = '';

  try {
    for await (const chunk of sysAgent.stream(chatHistory, mode)) {
      const delta = chunk?.choices?.[0]?.delta;

      if (delta?.tool_calls) {
        const tc = delta.tool_calls[0];
        const args = Object.entries(tc.args || {})
          .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
          .join(', ');
        console.log(dim(`${tc.name}(${args})`));
      }
      if (delta?.content) response = delta.content;  // overwrite — last chunk is output.md
    }

    if (response) {
      console.log(`${modeLabel[mode]}:`);
      console.log(marked.parse(response));
      chatHistory.push({ role: "assistant", content: response });
    } else {
      console.log(`${modeLabel[mode]}: (no output)`);
    }
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }

  // Stats
  const stats = sysAgent.getStats();
  const total = stats.vectorHits + stats.webRequests;
  if (total > 0) {
    console.log(`[Cache: ${Math.round((stats.vectorHits / total) * 100)}% (${stats.vectorHits}/${total})]`);
  }
  sysAgent.resetStats();
}

function handleMode(cmd) {
  const [, arg] = cmd.trim().split(/\s+/);
  if (!arg) {
    console.log(`Current mode: ${mode}\n  probe: fast search\n  rover: in-depth research`);
    return;
  }
  if (arg === 'probe' || arg === 'rover') {
    mode = arg;
    console.log(`Switched to ${mode === 'probe' ? 'Probe' : 'Rover'} mode`);
    return;
  }
  console.log('Usage: /mode, /mode probe, /mode rover');
}

async function handleReset(cmd) {
  const [, arg] = cmd.trim().split(/\s+/);
  const actions = {
    db:      () => sysAgent.resetVectorDB().then(() => 'Vector DB cleared.'),
    prompts: () => (sysAgent.resetPrompts(), 'Prompts reset.'),
    all:     () => sysAgent.resetVectorDB().then(() => (sysAgent.resetPrompts(), 'All reset.')),
  };
  if (actions[arg]) {
    const msg = await actions[arg]();
    console.log(msg);
  } else {
    console.log('Usage: /reset [db|prompts|all]');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════════════

// Banner — clean, minimal
const blue = s => C(34, s);

console.log(blue('─'.repeat(64)));
console.log(bold('Wikipedia Agent'));
console.log(dim('A personal research assistant for Wikipedia'));
console.log();
console.log('  Ask questions no one ever asked');
console.log();
console.log(blue('Commands'));
console.log(dim('  /mode            Switch between probe (fast) and rover (in-depth)'));
console.log(dim('  /mode probe       Direct search with Wikipedia tools'));
console.log(dim('  /mode rover       Full pipeline: compose → search → refine'));
console.log(dim('  /reset           Clear vector database, prompts, or all'));
console.log(dim('  /reset db         Delete cached Wikipedia content'));
console.log(dim('  /reset prompts     Restore prompts to default'));
console.log(dim('  /exit             Exit'));
console.log();

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log(dim('\nGoodbye!'));
  rl.close();
  process.exit(0);
});

// Run main loop
(async () => {
  for (;;) {
    const input = (await ask()).trim();
    if (!input) continue;

    const cmd = input.toLowerCase();

    if (cmd === '/exit') { console.log(dim('Goodbye!')); break; }
    if (cmd.startsWith('/mode'))  { handleMode(input);  continue; }
    if (cmd.startsWith('/reset')) { await handleReset(input); continue; }

    await runQuery(input);
  }
  rl.close();
  process.exit(0);
})();
