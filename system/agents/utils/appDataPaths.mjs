/**
 * Path utilities for user app data (prompts/config)
 * Shared by all agents/tools - single source of truth
 */

import { join } from "path";
import { homedir } from "os";

/**
 * Get base directory for user config (platform-aware)
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
 * Get user prompts directory (dynamic prompts)
 * Path: <base>/EVPAgent/prompts/dynamic_prompts
 */
export function getUserPromptsDir() {
  return join(getBaseDir(), "EVPAgent", "prompts", "dynamic_prompts");
}

/**
 * Get user config directory (system prompts)
 * Path: <base>/EVPAgent/prompts/config
 */
export function getUserConfigDir() {
  return join(getBaseDir(), "EVPAgent", "prompts", "config");
}

/**
 * Get output directory
 * Path: <base>/EVPAgent/output
 */
export function getOutputDir() {
  return join(getBaseDir(), "EVPAgent", "output");
}