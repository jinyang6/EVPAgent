import { tool } from "@langchain/core/tools";
import { readFileSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import z from "zod";

import { getUserPromptsDir, getUserConfigDir } from "../../../utils/appDataPaths.mjs";

/**
 * Combine selected prompts and write dynamic_system_prompt.md and session_manifest.json
 */
export const combinePromptsTool = tool(
  async ({ prompts, userQuery }) => {
    const promptsDir = getUserPromptsDir();

    // Read base system prompt
    const configDir = getUserConfigDir();
    const systemPromptPath = join(configDir, 'rover', 'rover_system_prompt.md');
    
    if (!existsSync(systemPromptPath)) {
      return "Error: rover_system_prompt.md not found";
    }
    
    let systemPrompt = readFileSync(systemPromptPath, 'utf-8');
    
    // Replace each placeholder with content from selected prompts
    for (const p of prompts) {
      const filePath = join(promptsDir, p.section, `${p.promptName}.json`);
      if (existsSync(filePath)) {
        const content = readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(content);
        const placeholder = p.section === 'Rephrase' ? '${Rephrase}' : '${Loop}';
        systemPrompt = systemPrompt.replace(placeholder, parsed.content || '');
      }
    }
    
    // Write dynamic_system_prompt.md
    const dynamicPromptPath = join(promptsDir, 'dynamic_system_prompt.md');
    writeFileSync(dynamicPromptPath, systemPrompt, 'utf-8');
    
    // Write session_manifest.json
    const manifest = {
      userQuery,
      promptsUsed: prompts.map(p => ({ section: p.section, name: p.promptName })),
      searchHistory: [],
      timestamp: new Date().toISOString()
    };
    const manifestPath = join(promptsDir, 'session_manifest.json');
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
    
    return `Combined ${prompts.length} prompts. Written to dynamic_system_prompt.md and session_manifest.json`;
  },
  {
    name: 'combinePrompts',
    description: 'Combine selected prompts into dynamic_system_prompt.md and create session_manifest.json with the combination.',
    schema: z.object({
      prompts: z.array(z.object({
        section: z.enum(['Rephrase', 'Loop']).describe('Section: Rephrase or Loop'),
        promptName: z.string().describe('Name of the prompt file (without .json)')
      })).describe('Array of prompts to combine'),
      userQuery: z.string().describe('The original user query')
    })
  }
);