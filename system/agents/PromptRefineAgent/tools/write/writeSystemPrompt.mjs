import { tool } from "@langchain/core/tools";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
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
 * Write or update the main system prompt
 */
export const writeSystemPromptTool = tool(
  async ({ content }) => {
    const configDir = getConfigDir();

    // Ensure directory exists
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    const filePath = join(configDir, "system_prompt.md");

    writeFileSync(filePath, content, 'utf-8');

    return `Written system_prompt.md to ${filePath}`;
  },
  {
    name: 'writeSystemPrompt',
    description: 'Write or update the main system prompt (system_prompt.md). This is the primary prompt that guides search behavior. Use this to optimize search strategy, reduce cost, and improve answer quality.',
    schema: z.object({
      content: z.string().describe('The full markdown content of the system prompt')
    })
  }
);