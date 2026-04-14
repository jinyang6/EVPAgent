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
import { composerGraph } from '../system/agents/PromptComposerAgent/graph.mjs';
import { searchGraph } from '../system/agents/SearchAgent/graph.mjs';
import { refineGraph } from '../system/agents/PromptRefineAgent/graph.mjs';
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

// Agent configuration - used by SysAgent internally
const baseConfig = {
  configurable: {
    baseURL: process.env.SEARCH_MODEL_BASE_URL,
    apiKey: process.env.SEARCH_MODEL_API_KEY,
    modelId: process.env.SEARCH_MODEL_ID,
  },
  recursionLimit: 100,
};

/**
 * Read dynamic system prompt if it exists
 */
function readDynamicSystemPrompt() {
  const dynamicPath = join(userPromptsDir, 'dynamic_system_prompt.md');
  if (existsSync(dynamicPath)) {
    const content = readFileSync(dynamicPath, 'utf-8');
    if (content.trim().length > 0) {
      return content;
    }
  }
  return null;
}

/**
 * Print first 5 lines of content
 */
function printLines(content, prefix = "") {
  if (!content) return;
  const lines = content.split('\n').slice(0, 5);
  for (const line of lines) {
    console.log(`${prefix}${line}`);
  }
}

/**
 * Main orchestration function - orchestrates all agents
 * @param {string} userQuery - The user's search query
 * @param {function} onOutput - Callback function to receive streaming output (content: string) => void
 */
async function processQuery(userQuery, onOutput) {
  console.log(`\n[SysAgent] Starting orchestration for query: "${userQuery}"\n`);
  
  // Step 1: Run PromptComposerAgent to create dynamic_system_prompt.md
  console.log("[ComposerAgent] Starting...");
  const composerState = { messages: [{ role: "user", content: userQuery }] };
  for await (const chunk of await composerGraph.stream(composerState, baseConfig)) {
    if (chunk.agent) {
      const msg = chunk.agent.messages?.[0];
      if (msg?.tool_calls) {
        for (const tc of msg.tool_calls) {
          console.log(`  [ComposerAgent] Tool: ${tc.name}`, tc.arguments ? `(${JSON.stringify(tc.arguments)})` : '');
        }
      }
      if (msg?.content) {
        printLines(msg.content, "    ");
      }
    }
    if (chunk.tools) {
      const toolMsg = chunk.tools.messages?.[0];
      if (toolMsg?.content) {
        console.log(`  [ComposerAgent] Result:`);
        printLines(toolMsg.content, "    ");
      }
    }
  }
  console.log("[ComposerAgent] Done\n");
  
  // Step 2: Run SearchAgent with the dynamic prompt
  console.log("[SearchAgent] Starting...");
  const dynamicPrompt = readDynamicSystemPrompt();
  let systemPrompt;
  if (dynamicPrompt) {
    systemPrompt = dynamicPrompt;
    console.log("[SearchAgent] Using dynamic system prompt");
  } else {
    systemPrompt = buildSystemPrompt(userConfigDir);
    console.log("[SearchAgent] Using default system prompt");
  }
  
  const searchConfig = {
    ...baseConfig,
    configurable: {
      ...baseConfig.configurable,
      systemPrompt,
    }
  };
  
  const searchState = { messages: [{ role: "user", content: userQuery }] };
  for await (const chunk of await searchGraph.stream(searchState, searchConfig)) {
    if (chunk.agent) {
      const msg = chunk.agent.messages?.[0];
      if (msg?.tool_calls) {
        for (const tc of msg.tool_calls) {
          console.log(`  [SearchAgent] Tool: ${tc.name}`, tc.arguments ? `(${JSON.stringify(tc.arguments)})` : '');
        }
      }
      const content = msg?.content;
      if (content) {
        onOutput(content);
      }
    }
    if (chunk.tools) {
      const toolMsg = chunk.tools.messages?.[0];
      if (toolMsg?.content) {
        console.log(`  [SearchAgent] Result:`);
        printLines(toolMsg.content, "    ");
      }
    }
  }
  console.log("[SearchAgent] Done\n");
  
  // Check search success before calling RefineAgent
  const manifestPath = join(userPromptsDir, 'session_manifest.json');
  let searchSuccess = false;
  if (existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      searchSuccess = manifest.searchSuccess || false;
      console.log(`[SysAgent] Search success: ${searchSuccess}`);
    } catch (e) {
      console.error("[SysAgent] Failed to read manifest:", e.message);
    }
  }
  
  // Step 3: Run PromptRefineAgent only if search was successful
  if (searchSuccess) {
    console.log("[RefineAgent] Starting (background)...");
    setImmediate(async () => {
    try {
      const refineState = { messages: [] };
      for await (const chunk of await refineGraph.stream(refineState, baseConfig)) {
        if (chunk.agent) {
          const msg = chunk.agent.messages?.[0];
          if (msg?.tool_calls) {
            for (const tc of msg.tool_calls) {
              console.log(`  [RefineAgent] Tool: ${tc.name}`, tc.arguments ? `(${JSON.stringify(tc.arguments)})` : '');
            }
          }
          if (msg?.content) {
            printLines(msg.content, "    ");
          }
        }
        if (chunk.tools) {
          const toolMsg = chunk.tools.messages?.[0];
          if (toolMsg?.content) {
            console.log(`  [RefineAgent] Result:`);
            printLines(toolMsg.content, "    ");
          }
        }
      }
      console.log("[RefineAgent] Done\n");
      } catch (error) {
        console.error("[RefineAgent] Background task failed:", error.message);
      }
    });
  } else {
    console.log("[RefineAgent] Skipped (search was not successful)\n");
  }
}

// Export for use by TUI
export { processQuery, baseConfig };

// For direct execution, run a simple test
if (process.argv[1] && (process.argv[1].endsWith('cli.jsx') || process.argv[1].endsWith('cli.js'))) {
  // This is the bundled entry point - TUI handles everything
  render(React.createElement(App, { 
    agent: null, 
    config: baseConfig,
    processQuery,
    buildSystemPrompt: () => buildSystemPrompt(userConfigDir),
    readDynamicSystemPrompt
  }), {
    exitOnCtrlC: true,
  });
}