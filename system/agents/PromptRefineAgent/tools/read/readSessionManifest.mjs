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
 * Read session manifest to get current session info
 */
export const readSessionManifestTool = tool(
  async () => {
    const promptsDir = getPromptsDir();
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