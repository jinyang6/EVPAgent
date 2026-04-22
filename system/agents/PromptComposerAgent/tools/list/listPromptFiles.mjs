import { tool } from "@langchain/core/tools";
import { readFileSync, readdirSync, existsSync } from "fs";
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
 * List available prompt files in both folders
 */
export const listPromptFilesTool = tool(
  async () => {
    const promptsDir = getPromptsDir();
    const allFiles = [];

    for (const folder of ['Rephrase', 'Loop']) {
      const folderPath = join(promptsDir, folder);

      if (!existsSync(folderPath)) continue;

      const files = readdirSync(folderPath)
        .filter(f => f.endsWith('.json'))
        .map(f => {
          try {
            const content = readFileSync(join(folderPath, f), 'utf-8');
            const parsed = JSON.parse(content);
            return {
              section: folder,
              name: parsed.name || f.replace('.json', ''),
              description: parsed.description || ''
            };
          } catch {
            return { section: folder, name: f.replace('.json', ''), description: '' };
          }
        });

      allFiles.push(...files);
    }

    return JSON.stringify(allFiles);
  },
  {
    name: 'listPromptFiles',
    description: 'List available prompt files in both Rephrase and Loop folders. Returns JSON array of {section, name, description} objects.',
    schema: z.object({})
  }
);