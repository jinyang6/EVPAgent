import { tool } from "@langchain/core/tools";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import z from "zod";

/**
 * Get platform-aware prompts directory
 */
function getPromptsDir() {
  const homeDir = process.env.APPDATA || join(process.env.HOME || "", ".evpagent");
  if (process.platform === 'win32') {
    return join(process.env.APPDATA, "EVPAgent", "prompts", "dynamic_prompts");
  } else if (process.platform === 'darwin') {
    return join(homeDir, "Library", "Application Support", "EVPAgent", "prompts", "dynamic_prompts");
  } else {
    return join(homeDir, ".config", "evpagent", "prompts", "dynamic_prompts");
  }
}

/**
 * Read a specific prompt file content
 */
export const readPromptTool = tool(
  async ({ prompt }) => {
    const promptsDir = getPromptsDir();
    const filePath = join(promptsDir, prompt.section, `${prompt.promptName}.json`);
    
    if (!existsSync(filePath)) {
      return JSON.stringify({ error: `Prompt ${prompt.promptName} not found in ${prompt.section}` });
    }
    
    return readFileSync(filePath, 'utf-8');
  },
  {
    name: 'readPrompt',
    description: 'Read a specific prompt file by section and name. Returns full JSON with name, description, and content.',
    schema: z.object({
      prompt: z.object({
        section: z.enum(['Rephrase', 'Loop']).describe('Section folder: Rephrase or Loop'),
        promptName: z.string().describe('Name of the prompt file (without .json)')
      })
    })
  }
);