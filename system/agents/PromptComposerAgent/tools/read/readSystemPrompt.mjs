import { tool } from "@langchain/core/tools";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import z from "zod";

/**
 * Get platform-aware config directory for base system prompt
 */
function getConfigDir() {
  const homeDir = process.env.APPDATA || join(process.env.HOME || "", ".evpagent");
  if (process.platform === 'win32') {
    return join(process.env.APPDATA, "EVPAgent", "prompts", "config");
  } else if (process.platform === 'darwin') {
    return join(homeDir, "Library", "Application Support", "EVPAgent", "prompts", "config");
  } else {
    return join(homeDir, ".config", "evpagent", "prompts", "config");
  }
}

/**
 * Read the base system prompt from config
 */
export const readSystemPromptTool = tool(
  async () => {
    const configDir = getConfigDir();
    const systemPromptPath = join(configDir, 'system_prompt.md');
    
    if (!existsSync(systemPromptPath)) {
      return "Error: system_prompt.md not found in config directory";
    }
    
    return readFileSync(systemPromptPath, 'utf-8');
  },
  {
    name: 'readSystemPrompt',
    description: 'Read the base system prompt template. Returns the full content of the system_prompt.md file which contains ${Rephrase} and ${Loop} placeholders.',
    schema: z.object({})
  }
);