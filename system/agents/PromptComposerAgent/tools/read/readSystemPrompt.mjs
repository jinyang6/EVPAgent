import { tool } from "@langchain/core/tools";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import z from "zod";
import { getUserConfigDir } from "../../../utils/appDataPaths.mjs";

/**
 * Read the base system prompt from config
 */
export const readSystemPromptTool = tool(
  async () => {
    const configDir = getUserConfigDir();
    const systemPromptPath = join(configDir, 'rover', 'rover_system_prompt.md');

    if (!existsSync(systemPromptPath)) {
      return "Error: rover_system_prompt.md not found in config directory";
    }

    return readFileSync(systemPromptPath, 'utf-8');
  },
  {
    name: 'readSystemPrompt',
    description: 'Read the rover system prompt template (rover_system_prompt.md). Returns the full content which contains ${Rephrase} and ${Loop} placeholders.',
    schema: z.object({})
  }
);