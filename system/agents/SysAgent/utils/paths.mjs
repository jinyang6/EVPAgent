/**
 * Path utilities for SysAgent
 */

import { join, dirname } from "path";
import { homedir } from "os";
import { fileURLToPath } from "url";

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
 * Get directory of the running script (for bundled resources)
 */
export function getScriptDir() {
  if (typeof __dirname !== "undefined" && __dirname !== import.meta.url) {
    return __dirname;
  }
  return dirname(fileURLToPath(import.meta.url));
}
