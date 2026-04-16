#!/usr/bin/env node

/**
 * EVPAgent CLI Entry Point
 * 
 * Usage: 
 *   npm start                    - Run directly
 *   npm link && evp              - Install globally and run
 */

import 'dotenv/config';
import React from 'react';
import { render } from 'ink';
import App from './tui/App.jsx';
import { createSysAgent } from '../system/agents/SysAgent/index.mjs';
import { formatStatsReport, resetResponseStats } from '../system/agents/SearchAgent/tools/stats.mjs';
import { readFileSync, existsSync, cpSync, mkdirSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { homedir } from 'os';

/**
 * Get platform-aware config directory
 */
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

/**
 * Get platform-aware prompts directory
 */
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

/**
 * Get the directory containing this script (dist/)
 */
function getScriptDir() {
  if (typeof __dirname !== 'undefined') {
    return __dirname;
  }
  const scriptPath = fileURLToPath(import.meta.url);
  return dirname(scriptPath);
}

/**
 * Read version from version.json
 */
function getVersion() {
  try {
    const scriptDir = getScriptDir();
    const versionPath = join(scriptDir, 'version.json');
    if (existsSync(versionPath)) {
      const data = JSON.parse(readFileSync(versionPath, 'utf-8'));
      return data.version;
    }
  } catch (e) {
    // Ignore errors
  }
  return null;
}

/**
 * Copy config files to user app data
 */
function ensureConfigFiles() {
  const userConfigDir = getConfigDir();
  const scriptDir = getScriptDir();
  const distConfigDir = join(scriptDir, 'prompts', 'config');

  if (!existsSync(userConfigDir)) {
    mkdirSync(userConfigDir, { recursive: true });
  }

  // Copy config files from dist/prompts/config/ to user prompts/config/
  const configFiles = [
    'system_prompt.md',
    'Rephrase.md',
    'Loop.md',
  ];

  for (const file of configFiles) {
    const src = join(distConfigDir, file);
    const dest = join(userConfigDir, file);
    if (existsSync(src)) {
      cpSync(src, dest, { force: true }); // Always overwrite
    }
  }

  return userConfigDir;
}

/**
 * Copy prompt files to user app data
 */
function ensurePromptFiles() {
  const userPromptsDir = getPromptsDir();
  const scriptDir = getScriptDir();
  const distPromptsDir = join(scriptDir, 'prompts', 'dynamic_prompts');

  // Create user prompts directories
  const userLoopDir = join(userPromptsDir, 'Loop');
  const userRephraseDir = join(userPromptsDir, 'Rephrase');
  
  if (!existsSync(userLoopDir)) {
    mkdirSync(userLoopDir, { recursive: true });
  }
  if (!existsSync(userRephraseDir)) {
    mkdirSync(userRephraseDir, { recursive: true });
  }

  // Copy Loop prompts
  const distLoopDir = join(distPromptsDir, 'Loop');
  if (existsSync(distLoopDir)) {
    const files = readdirSync(distLoopDir);
    for (const file of files) {
      const src = join(distLoopDir, file);
      const dest = join(userLoopDir, file);
      cpSync(src, dest, { force: true }); // Always overwrite
    }
  }

  // Copy Rephrase prompts
  const distRephraseDir = join(distPromptsDir, 'Rephrase');
  if (existsSync(distRephraseDir)) {
    const files = readdirSync(distRephraseDir);
    for (const file of files) {
      const src = join(distRephraseDir, file);
      const dest = join(userRephraseDir, file);
      cpSync(src, dest, { force: true }); // Always overwrite
    }
  }

  return userPromptsDir;
}

/**
 * Read and concatenate system prompt sections at runtime
 */
function buildSystemPrompt(configDir) {
  const systemPromptPath = join(configDir, 'system_prompt.md');
  let content = readFileSync(systemPromptPath, 'utf-8');

  const replacements = {
    '${Rephrase}': 'Rephrase.md',
    '${Loop}': 'Loop.md',
  };

  for (const [placeholder, fileName] of Object.entries(replacements)) {
    const filePath = join(configDir, fileName);
    if (existsSync(filePath)) {
      const fileContent = readFileSync(filePath, 'utf-8');
      content = content.replace(placeholder, fileContent);
    }
  }

  return content;
}

// Ensure config and prompt files exist in user app data
const userConfigDir = ensureConfigFiles();
const userPromptsDir = ensurePromptFiles();

// Display version
const version = getVersion();
if (version) {
  console.log(`EVPAgent v${version}\n`);
}

// Agent configuration
const agentConfig = {
  baseURL: process.env.SEARCH_MODEL_BASE_URL,
  apiKey: process.env.SEARCH_MODEL_API_KEY,
  modelId: process.env.SEARCH_MODEL_ID,
};

// Create SysAgent instance
const sysAgent = createSysAgent(agentConfig);

/**
 * Print first 5 lines of content
 */
function printLines(content, prefix = "") {
  if (!content || typeof content !== 'string') return;
  const lines = content.split('\n').slice(0, 5);
  for (const line of lines) {
    console.log(`${prefix}${line}`);
  }
}

/**
 * Main orchestration function - uses SysAgent pipeline
 * @param {string} userQuery - The user's search query
 */
async function processQuery(userQuery) {
  try {
    // Stream from SysAgent
    for await (const chunk of sysAgent.stream(userQuery)) {
      // chunk is OpenAI-compatible: { choices: [{ delta: { content: "..." } }] }
      if (chunk?.choices?.[0]?.delta?.content) {
        process.stdout.write(chunk.choices[0].delta.content);
      }
      if (chunk?.choices?.[0]?.delta?.tool_calls) {
        const tc = chunk.choices[0].delta.tool_calls[0];
        console.log(`\n  → ${tc.name}\n`);
      }
    }
    console.log('\n[SysAgent] Pipeline complete\n');
  } catch (error) {
    console.error("\n[SysAgent] Pipeline error:", error.message);
  } finally {
    // Print cache stats
    console.error(formatStatsReport());
    resetResponseStats();
  }
}

// Export for use by TUI
export { processQuery, agentConfig };

// For direct execution, run a simple test
if (process.argv[1] && (process.argv[1].endsWith('cli.jsx') || process.argv[1].endsWith('cli.js'))) {
  // This is the bundled entry point - TUI handles everything
  render(React.createElement(App, {
    agent: null,
    config: agentConfig,
    processQuery,
  }), {
    exitOnCtrlC: true,
  });
}