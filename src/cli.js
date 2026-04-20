#!/usr/bin/env node

/**
 * EVPAgent CLI - Simple Node.js readline interface
 */

import 'dotenv/config';
import readline from 'readline';
import { createSysAgent } from '../system/agents/SysAgent/index.mjs';
import { formatStatsReport, resetResponseStats } from '../system/agents/SearchAgent/tools/stats.mjs';
import { existsSync, cpSync, mkdirSync, readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

// ═══════════════════════════════════════════════════════════════════════════════
// Path Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function getConfigDir() {
  const homeDir = homedir();
  if (process.platform === 'win32') {
    return process.env.APPDATA
      ? join(process.env.APPDATA, "EVPAgent", "prompts", "config")
      : join(homeDir, ".evpagent", "prompts", "config");
  } else if (process.platform === 'darwin') {
    return join(homeDir, "Library", "Application Support", "EVPAgent", "prompts", "config");
  } else {
    return process.env.XDG_CONFIG_HOME
      ? join(process.env.XDG_CONFIG_HOME, "evpagent", "prompts", "config")
      : join(homeDir, ".config", "evpagent", "prompts", "config");
  }
}

function getPromptsDir() {
  const homeDir = homedir();
  if (process.platform === 'win32') {
    return process.env.APPDATA
      ? join(process.env.APPDATA, "EVPAgent", "prompts", "dynamic_prompts")
      : join(homeDir, ".evpagent", "prompts", "dynamic_prompts");
  } else if (process.platform === 'darwin') {
    return join(homeDir, "Library", "Application Support", "EVPAgent", "prompts", "dynamic_prompts");
  } else {
    return process.env.XDG_CONFIG_HOME
      ? join(process.env.XDG_CONFIG_HOME, "evpagent", "prompts", "dynamic_prompts")
      : join(homeDir, ".config", "evpagent", "prompts", "dynamic_prompts");
  }
}

function getScriptDir() {
  if (typeof __dirname !== 'undefined') return __dirname;
  return dirname(fileURLToPath(import.meta.url));
}

// ═══════════════════════════════════════════════════════════════════════════════
// File Setup
// ═══════════════════════════════════════════════════════════════════════════════

function ensureConfigFiles() {
  const userConfigDir = getConfigDir();
  const scriptDir = getScriptDir();
  const distConfigDir = join(scriptDir, 'prompts', 'config');

  if (!existsSync(userConfigDir)) {
    mkdirSync(userConfigDir, { recursive: true });
  }

  for (const file of ['system_prompt.md', 'Rephrase.md', 'Loop.md']) {
    const src = join(distConfigDir, file);
    const dest = join(userConfigDir, file);
    if (existsSync(src)) cpSync(src, dest, { force: true });
  }

  return userConfigDir;
}

function ensurePromptFiles() {
  const userPromptsDir = getPromptsDir();
  const scriptDir = getScriptDir();
  const distPromptsDir = join(scriptDir, 'prompts', 'dynamic_prompts');

  for (const subdir of ['Loop', 'Rephrase']) {
    const userDir = join(userPromptsDir, subdir);
    const distDir = join(distPromptsDir, subdir);
    if (!existsSync(userDir)) mkdirSync(userDir, { recursive: true });
    if (existsSync(distDir)) {
      for (const file of readdirSync(distDir)) {
        cpSync(join(distDir, file), join(userDir, file), { force: true });
      }
    }
  }

  return userPromptsDir;
}

// Setup files
ensureConfigFiles();
ensurePromptFiles();

// ═══════════════════════════════════════════════════════════════════════════════
// Agent Setup
// ═══════════════════════════════════════════════════════════════════════════════

const agentConfig = {
  baseURL: process.env.SEARCH_MODEL_BASE_URL,
  apiKey: process.env.SEARCH_MODEL_API_KEY,
  modelId: process.env.SEARCH_MODEL_ID,
};

const sysAgent = createSysAgent(agentConfig);

// ═══════════════════════════════════════════════════════════════════════════════
// CLI Interface
// ═══════════════════════════════════════════════════════════════════════════════

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let spinIndex = 0;
let spinInterval = null;

function startSpinner() {
  spinInterval = setInterval(() => {
    spinIndex++;
    process.stdout.write(`\r${frames[spinIndex % frames.length]} thinking...`);
  }, 80);
}

function stopSpinner() {
  if (spinInterval) {
    clearInterval(spinInterval);
    spinInterval = null;
    process.stdout.write('\r' + ' '.repeat(30) + '\r');
  }
}

async function askQuestion(query) {
  return new Promise((resolve) => {
    rl.question(`User: ${query}\nAgent: `, (answer) => {
      resolve(answer);
    });
  });
}

async function runQuery(query) {
  startSpinner();
  let output = '';

  try {
    for await (const chunk of sysAgent.stream(query)) {
      if (chunk?.choices?.[0]?.delta?.content) {
        output += chunk.choices[0].delta.content;
      }
      if (chunk?.choices?.[0]?.delta?.tool_calls) {
        const tc = chunk.choices[0].delta.tool_calls[0];
        output += `\n  → ${tc.name}\n`;
      }
    }
    stopSpinner();
    console.log(output || '(no output)');
  } catch (error) {
    stopSpinner();
    console.error(`Error: ${error.message}`);
  }

  console.error(formatStatsReport());
  resetResponseStats();
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Loop
// ═══════════════════════════════════════════════════════════════════════════════

console.log('═══════════════════════════════════════════════════════════════');
console.log('          EVPAgent - Ask questions no one ever asked');
console.log('═══════════════════════════════════════════════════════════════\n');

async function main() {
  const initialQuery = await askQuestion('');

  if (initialQuery.trim()) {
    await runQuery(initialQuery);
  }

  // Keep asking until user exits
  while (true) {
    const query = await askQuestion('');
    if (!query.trim() || query.toLowerCase() === 'exit') {
      console.log('Goodbye!');
      break;
    }
    await runQuery(query);
  }

  rl.close();
}

main();