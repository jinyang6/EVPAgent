import { tool } from "@langchain/core/tools";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import z from "zod";
import { getUserPromptsDir } from "../../../utils/appDataPaths.mjs";

/**
 * List available prompt files in a folder
 */
export const listPromptFilesTool = tool(
  async ({ folder }) => {
    const promptsDir = getUserPromptsDir();
    const folderPath = join(promptsDir, folder);
    
    if (!existsSync(folderPath)) {
      return JSON.stringify([]);
    }
    
    const files = readdirSync(folderPath)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        try {
          const content = readFileSync(join(folderPath, f), 'utf-8');
          const parsed = JSON.parse(content);
          return {
            name: parsed.name || f.replace('.json', ''),
            description: parsed.description || ''
          };
        } catch {
          return { name: f.replace('.json', ''), description: '' };
        }
      });
    
    return JSON.stringify(files);
  },
  {
    name: 'listPromptFiles',
    description: 'List available prompt files in a folder. Returns JSON array of {name, description} objects.',
    schema: z.object({
      folder: z.enum(['Rephrase', 'Loop']).describe('Folder to list: Rephrase or Loop')
    })
  }
);