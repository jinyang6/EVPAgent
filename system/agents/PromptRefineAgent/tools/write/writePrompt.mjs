import { tool } from "@langchain/core/tools";
import { readFileSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import z from "zod";
import { getUserPromptsDir } from "../../../utils/appDataPaths.mjs";

/**
 * Write or update a prompt file
 */
export const writePromptTool = tool(
  async ({ prompt }) => {
    const promptsDir = getUserPromptsDir();
    const folderPath = join(promptsDir, prompt.section);
    
    // Ensure folder exists
    if (!existsSync(folderPath)) {
      return JSON.stringify({ error: `Folder ${prompt.section} does not exist` });
    }
    
    const filePath = join(folderPath, `${prompt.promptName}.json`);
    
    const promptData = {
      name: prompt.promptName,
      description: prompt.description,
      content: prompt.content
    };
    
    writeFileSync(filePath, JSON.stringify(promptData, null, 2), 'utf-8');
    
    return `Written prompt ${prompt.promptName} to ${prompt.section} folder`;
  },
  {
    name: 'writePrompt',
    description: 'Write or update a prompt file with name, description, and content.',
    schema: z.object({
      prompt: z.object({
        section: z.enum(['Rephrase', 'Loop']).describe('Section folder: Rephrase or Loop'),
        promptName: z.string().describe('Name for the prompt file (without .json)'),
        description: z.string().describe('Brief description of when to use this prompt'),
        content: z.string().describe('The markdown content of the prompt')
      })
    })
  }
);