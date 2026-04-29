/**
 * Path utilities for SysAgent
 */

import { join, dirname } from "path";
import { homedir } from "os";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

/**
 * Get base directory for user config
 */
function getBaseDir() {
  const homeDir = homedir();
  if (process.platform === "win32") {
    return process.env.APPDATA || join(homeDir, ".evpagent");
  }
  if (process.platform === "darwin") {
    return join(homeDir, "Library", "Application Support");
  }
  return process.env.XDG_CONFIG_HOME || join(homeDir, ".config");
}

/**
 * Get prompts directory (dynamic prompts)
 */
export function getPromptsDir() {
  return join(getBaseDir(), "EVPAgent", "prompts", "dynamic_prompts");
}

/**
 * Get config directory (system prompts)
 */
export function getConfigDir() {
  return join(getBaseDir(), "EVPAgent", "prompts", "config");
}

/**
 * Get directory of the EVPAgent system prompts
 * Returns path to the prompts folder containing config/
 */
export function getScriptDir() {
  const entryDir = dirname(fileURLToPath(import.meta.url));

  // Try multiple possible locations
  const possiblePaths = [
    // Bundled npm: node_modules/evpagent/prompts/
    join(entryDir, "..", "..", "..", "..", "prompts"),
    // Built dist: EVPAgent/src/dist/prompts/
    join(entryDir, "..", "..", "system", "prompts"),
    // Development source: EVPAgent/system/prompts/
    join(entryDir, "..", "..", "..", "..", "system", "prompts"),
  ];

  for (const p of possiblePaths) {
    if (existsSync(p)) {
      return p;
    }
  }

  // Fallback: return first path
  return possiblePaths[0];
}
