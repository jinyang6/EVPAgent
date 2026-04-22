import { tool } from "@langchain/core/tools";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
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
 * Get output directory (EVPAgent/output)
 */
function getOutputDir() {
  const homeDir = process.env.APPDATA || join(process.env.HOME || "", ".evpagent");
  if (process.platform === 'win32') {
    return join(process.env.APPDATA, "EVPAgent", "output");
  } else if (process.platform === 'darwin') {
    return join(homeDir, "Library", "Application Support", "EVPAgent", "output");
  } else {
    return join(homeDir, ".config", "evpagent", "output");
  }
}

/**
 * Get output file path
 */
function getOutputFile() {
  return join(getOutputDir(), "output.md");
}

/**
 * reportTool - marks search session as complete and optionally saves final response
 * @param {Object} params - Tool parameters
 * @param {boolean} params.searchSuccess - Whether the search was successful
 * @param {string} [params.response] - Optional final response to write to output.md
 * @returns {string} Result message
 */
export const reportTool = tool(
  async ({ searchSuccess, response }) => {
    const promptsDir = getPromptsDir();
    const manifestPath = join(promptsDir, 'session_manifest.json');

    // Write response to output.md if provided
    if (response) {
      const outputDir = getOutputDir();
      const outputFile = getOutputFile();

      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }
      writeFileSync(outputFile, response, 'utf-8');
    }

    // Update manifest
    if (!existsSync(manifestPath)) {
      return "Error: session_manifest.json not found";
    }

    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      manifest.searchSuccess = searchSuccess;
      manifest.timestamp = new Date().toISOString();
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
    } catch (error) {
      return `Error: ${error.message}`;
    }
  },
  {
    name: 'report',
    description: 'Report search success status and optionally save final response to output.md.',
    schema: z.object({
      searchSuccess: z.boolean().describe('Whether the search was successful'),
      response: z.string().optional().describe('Final response to save to output.md')
    })
  }
);