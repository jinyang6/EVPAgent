import { tool } from "@langchain/core/tools";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import z from "zod";

/**
 * Get platform-aware config directory
 */
function getConfigDir() {
  if (process.platform === 'win32') {
    return join(process.env.APPDATA, "EVPAgent", "prompts", "config");
  } else if (process.platform === 'darwin') {
    return join(process.env.HOME, "Library", "Application Support", "EVPAgent", "prompts", "config");
  } else {
    return join(process.env.HOME, ".config", "evpagent", "prompts", "config");
  }
}

/**
 * Read the main system prompt content
 */
export const readSystemPromptTool = tool(
  async ({}) => {
    const configDir = getConfigDir();
    const filePath = join(configDir, "system_prompt.md");

    if (!existsSync(filePath)) {
      // Try source location for development
      const sourcePath = join(process.cwd(), "system", "prompts", "config", "system_prompt.md");
      if (existsSync(sourcePath)) {
        return readFileSync(sourcePath, 'utf-8');
      }
      return JSON.stringify({ error: `System prompt not found at ${filePath}` });
    }

    return readFileSync(filePath, 'utf-8');
  },
  {
    name: 'readSystemPrompt',
    description: 'Read the main system prompt (system_prompt.md) content. This is the primary prompt that guides search behavior.',
    schema: z.object({})
  }
);