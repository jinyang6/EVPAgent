#!/usr/bin/env node

/**
 * EVPAgent CLI — Readline interface
 *
 * Commands:
 *   /mode              Show current mode
 *   /mode probe|rover  Switch mode
 *   /serve [port]      Start the OpenAI-compatible API server
 *   /stop              Stop the API server
 *   /reset db|prompts|all  Clear data
 *   /exit              Quit
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env'), quiet: true });

import readline from 'readline';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { marked } from 'marked';
import { markedTerminal } from 'marked-terminal';
import { SysAgent } from '../system/agents/SysAgent/index.mjs';
import { AgentService } from './core/AgentService.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = __dirname.endsWith('dist') ? join(__dirname, '..') : __dirname;
const serverEntry = join(srcDir, 'api', 'index.mjs');

marked.use(markedTerminal());

// ═══════════════════════════════════════════════════════════════════════════════
// Setup
// ═══════════════════════════════════════════════════════════════════════════════

const sysAgent = new SysAgent();
let mode = 'probe';
const chatHistory = [];
let _serverProcess = null;

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
  chatHistory.push({ role: 'user', content: query });
  let response = '';

  try {
    for await (const event of AgentService.streamEvents(chatHistory, mode, { agent: sysAgent })) {
      if (event.type === 'tool') {
        console.log(dim(event.text));
      }
      if (event.type === 'content') {
        response = event.text;
      }
    }

    if (response) {
      console.log(`${modeLabel[mode]}:`);
      console.log(marked.parse(response));
      chatHistory.push({ role: 'assistant', content: response });
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
    mode = mode === 'probe' ? 'rover' : 'probe';
    console.log(`Switched to ${mode === 'probe' ? 'Probe' : 'Rover'} mode`);
    return;
  }
  const modeArg = arg.toLowerCase();
  if (modeArg === 'probe' || modeArg === 'rover') {
    mode = modeArg;
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

async function handleServe(cmd) {
  if (_serverProcess) {
    console.log(dim('API server is already running.'));
    return;
  }
  const [, portStr] = cmd.trim().split(/\s+/);
  const port = portStr || process.env.API_PORT || process.env.PORT || '3456';
  const env = { ...process.env, PORT: port };

  try {
    _serverProcess = spawn('node', [serverEntry], { env, stdio: 'inherit' });
    console.log(`API server starting on port ${port}…`);
    _serverProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.log(dim(`API server exited with code ${code}`));
      }
      _serverProcess = null;
    });
  } catch (e) {
    console.log(`Failed to start API server: ${e.message}`);
  }
}

function handleStop() {
  if (!_serverProcess) {
    console.log(dim('API server is not running.'));
    return;
  }
  _serverProcess.kill('SIGTERM');
  _serverProcess = null;
  console.log(dim('API server stopped.'));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════════════

const blue = s => C(34, s);

console.log(blue('─'.repeat(64)));
console.log(bold('Wikipedia Agent'));
console.log();
console.log('  Ask questions no one ever asked');
console.log();
console.log(blue('Commands'));
console.log(dim('  /mode            Switch between probe (fast) and rover (in-depth)'));
console.log(dim('  /mode probe       Direct search with Wikipedia tools'));
console.log(dim('  /mode rover       Full pipeline: compose → search → refine'));
console.log(dim('  /serve [port]     Start the OpenAI-compatible API server'));
console.log(dim('  /stop             Stop the API server'));
console.log(dim('  /reset            Clear vector database, prompts, or all'));
console.log(dim('  /reset db          Delete cached Wikipedia content'));
console.log(dim('  /reset prompts     Restore prompts to default'));
console.log(dim('  /exit              Exit'));
console.log();

process.on('SIGINT', () => {
  if (_serverProcess) { _serverProcess.kill('SIGTERM'); _serverProcess = null; }
  console.log(dim('\nGoodbye!'));
  rl.close();
  process.exit(0);
});

(async () => {
  for (;;) {
    const input = (await ask()).trim();
    if (!input) continue;

    const cmd = input.toLowerCase();

    if (cmd === '/exit') {
      if (_serverProcess) { _serverProcess.kill('SIGTERM'); _serverProcess = null; }
      console.log(dim('Goodbye!')); break;
    }
    if (cmd.startsWith('/mode'))  { handleMode(input);  continue; }
    if (cmd === '/stop')          { handleStop();       continue; }
    if (cmd.startsWith('/serve')) { await handleServe(input); continue; }
    if (cmd.startsWith('/reset')) { await handleReset(input); continue; }

    await runQuery(input);
  }
  rl.close();
  process.exit(0);
})();
