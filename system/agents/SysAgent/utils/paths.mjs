/**
 * Path utilities for SysAgent
 */

import { join } from "path";
import { homedir } from "os";

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
