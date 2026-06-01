/**
 * EVPAgent Configuration
 *
 * Resolves config files depending on runtime context:
 *   - Electron (packaged): user config at {userData}/config.json,
 *     shipped template at {appPath}/config.example.json
 *   - Electron (dev) / CLI:  config.json and config.example.json
 *     in process.cwd()
 *
 * On first run, auto-copies config.example.json → config.json so the
 * user gets sensible defaults.  API keys are NOT stored here — they
 * come from user Settings (localStorage).
 *
 * Electron env vars (set by electron/main.cjs before importing the API):
 *   EVPAGENT_USER_CONFIG_PATH     — full path to writable config.json
 *   EVPAGENT_EXAMPLE_CONFIG_PATH  — full path to shipped config.example.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

// ─── Resolve paths ───────────────────────────────────────────────────────────

function resolvePaths() {
  const userPath  = process.env.EVPAGENT_USER_CONFIG_PATH;
  const exPath    = process.env.EVPAGENT_EXAMPLE_CONFIG_PATH;

  if (userPath && exPath) {
    // Electron context (dev or packaged) — paths set explicitly by main process
    return { configPath: userPath, examplePath: exPath };
  }

  // CLI / standalone — assume everything is in cwd
  const cwd = process.cwd();
  return {
    configPath:  join(cwd, 'config.json'),
    examplePath: join(cwd, 'config.example.json'),
  };
}

// ─── Load ────────────────────────────────────────────────────────────────────

let _config = null;

function loadConfig() {
  if (_config) return _config;

  const { configPath, examplePath } = resolvePaths();

  // Auto-copy example → config.json on first run (read+write, not copyFile,
  // to work correctly across asar boundaries in packaged Electron).
  if (!existsSync(configPath) && existsSync(examplePath)) {
    console.log(`[config] First run — copying ${examplePath} → ${configPath}`);
    const dir = dirname(configPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const exampleContent = readFileSync(examplePath, 'utf-8');
    writeFileSync(configPath, exampleContent, 'utf-8');
  }

  if (!existsSync(configPath)) {
    throw new Error(
      `config.json not found at "${configPath}".  `
      + `Copy config.example.json to config.json and set your model.`
    );
  }

  const raw = readFileSync(configPath, 'utf-8').trim();
  if (!raw) {
    throw new Error(`config.json at "${configPath}" is empty.`);
  }

  try {
    _config = JSON.parse(raw);
  } catch (e) {
    throw new Error(`config.json is malformed: ${e.message}`);
  }

  for (const section of ['searchModel', 'embeddingModel']) {
    const s = _config[section];
    if (!s?.baseUrl || !s?.modelId) {
      throw new Error(
        `config.json is missing "${section}.baseUrl" or "${section}.modelId".`
      );
    }
  }

  return _config;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/** @returns {{ searchModel: { baseUrl, modelId }, embeddingModel: { baseUrl, modelId } }} */
export function getConfig() {
  return loadConfig();
}

/** Reload config from disk (call after runtime edits). */
export function reloadConfig() {
  _config = null;
  return loadConfig();
}
