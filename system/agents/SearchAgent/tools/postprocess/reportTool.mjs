import { tool } from "@langchain/core/tools";
import { readFileSync, existsSync, writeFileSync } from "fs";
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
 * reportTool - marks search session as complete
 * Call this at the end of search to finalize the session manifest.
 * @param {Object} params - Tool parameters
 * @param {boolean} params.searchSuccess - Whether the search was successful
 * @returns {string} Result message
 */
export const reportTool = tool(
  async ({ searchSuccess }) => {
    const promptsDir = getPromptsDir();
    const manifestPath = join(promptsDir, 'session_manifest.json');
    
    if (!existsSync(manifestPath)) {
      return JSON.stringify({ error: "session_manifest.json not found" });
    }
    
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      
      manifest.searchSuccess = searchSuccess;
      manifest.timestamp = new Date().toISOString();
      
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
      
      return JSON.stringify({ success: true, searchSuccess, historyCount: manifest.searchHistory?.length || 0 });
    } catch (error) {
      return JSON.stringify({ success: false, error: error.message });
    }
  },
  {
    name: 'report',
    description: 'Report search success status to session_manifest.json.',
    schema: z.object({
      searchSuccess: z.boolean().describe('Whether the search was successful')
    })
  }
);