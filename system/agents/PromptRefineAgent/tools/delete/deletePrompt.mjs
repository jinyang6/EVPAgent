import { tool } from "@langchain/core/tools";
import { readFileSync, existsSync, unlinkSync } from "fs";
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
 * Delete a prompt file
 */
export const deletePromptTool = tool(
  async ({ prompt }) => {
    const promptsDir = getPromptsDir();
    const filePath = join(promptsDir, prompt.section, `${prompt.promptName}.json`);
    
    if (!existsSync(filePath)) {
      return `Prompt ${prompt.promptName} not found in ${prompt.section}`;
    }
    
    // Don't allow deleting the default prompt
    if (prompt.promptName === 'default') {
      return "Cannot delete the default prompt";
    }
    
    unlinkSync(filePath);
    
    return `Deleted prompt ${prompt.promptName} from ${prompt.section} folder`;
  },
  {
    name: 'deletePrompt',
    description: 'Delete a prompt file from a section folder.',
    schema: z.object({
      prompt: z.object({
        section: z.enum(['Rephrase', 'Loop']).describe('Section folder: Rephrase or Loop'),
        promptName: z.string().describe('Name of the prompt file to delete (without .json)')
      })
    })
  }
);