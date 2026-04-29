import { tool } from "@langchain/core/tools";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import z from "zod";
import { getUserPromptsDir } from "../../../utils/appDataPaths.mjs";

/**
 * Read session manifest to get current session info
 */
export const readSessionManifestTool = tool(
  async () => {
    const promptsDir = getUserPromptsDir();
    const manifestPath = join(promptsDir, 'session_manifest.json');
    
    if (!existsSync(manifestPath)) {
      return JSON.stringify({ error: "session_manifest.json not found" });
    }
    
    return readFileSync(manifestPath, 'utf-8');
  },
  {
    name: 'readSessionManifest',
    description: 'Read the current session manifest containing user query, prompts used, and search history.',
    schema: z.object({})
  }
);