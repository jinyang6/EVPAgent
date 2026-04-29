import { tool } from "@langchain/core/tools";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import z from "zod";
import { getUserConfigDir } from "../../../utils/appDataPaths.mjs";

/**
 * Read the main system prompt content
 */
export const readSystemPromptTool = tool(
  async ({}) => {
    const configDir = getUserConfigDir();
    const filePath = join(configDir, "rover", "rover_system_prompt.md");

    if (!existsSync(filePath)) {
      return JSON.stringify({ error: `System prompt not found at ${filePath}` });
    }

    return readFileSync(filePath, 'utf-8');
  },
  {
    name: 'readSystemPrompt',
    description: 'Read the main system prompt (rover_system_prompt.md) content. This is the primary prompt that guides rover mode search behavior.',
    schema: z.object({})
  }
);