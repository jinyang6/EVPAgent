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
import { workflow } from '../agent/graph/graph.mjs';
import { readFileSync, existsSync, cpSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { homedir } from 'os';

/**
 * Get platform-aware config directory (same pattern as LanceDB)
 */
function getConfigDir() {
  const homeDir = homedir();
  if (process.platform === 'win32') {
    return process.env.APPDATA
      ? join(process.env.APPDATA, "EVPAgent", "config")
      : join(homeDir, ".evpagent", "config");
  } else if (process.platform === 'darwin') {
    return join(homeDir, "Library", "Application Support", "EVPAgent", "config");
  } else {
    return process.env.XDG_CONFIG_HOME
      ? join(process.env.XDG_CONFIG_HOME, "evpagent", "config")
      : join(homeDir, ".config", "evpagent", "config");
  }
}

/**
 * Get the directory containing this script (dist/)
 */
function getScriptDir() {
  // Check for bundled environment (ESM bundle)
  if (typeof __dirname !== 'undefined') {
    return __dirname;
  }
  // Fallback for ESM modules
  const scriptPath = fileURLToPath(import.meta.url);
  return dirname(scriptPath);
}

/**
 * Copy config files to user app data if they don't exist
 */
function ensureConfigFiles() {
  const userConfigDir = getConfigDir();
  const scriptDir = getScriptDir();
  const distConfigDir = join(scriptDir, 'config');

  if (!existsSync(userConfigDir)) {
    mkdirSync(userConfigDir, { recursive: true });
  }

  // Copy config files from dist/ to user app data if they don't exist
  const configFiles = [
    'system_prompt.md',
    'Rephrase.md',
    'Loop.md',
  ];

  for (const file of configFiles) {
    const src = join(distConfigDir, file);
    const dest = join(userConfigDir, file);
    if (existsSync(src) && !existsSync(dest)) {
      cpSync(src, dest);
    }
  }

  return userConfigDir;
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

// Ensure config files exist in user app data
const userConfigDir = ensureConfigFiles();

// Build system prompt at runtime
const systemPrompt = buildSystemPrompt(userConfigDir);

// Agent configuration
const config = {
  configurable: {
    baseURL: process.env.SEARCH_MODEL_BASE_URL,
    apiKey: process.env.SEARCH_MODEL_API_KEY,
    modelId: process.env.SEARCH_MODEL_ID,
    systemPrompt,
  },
  recursionLimit: 100,
};

// Unwrap the workflow for Ink compatibility
const agent = {
  stream: async (state, cfg) => {
    return await workflow.stream(state, cfg || config);
  }
};

// Render the TUI
render(React.createElement(App, { agent, config }), {
  exitOnCtrlC: true,
});