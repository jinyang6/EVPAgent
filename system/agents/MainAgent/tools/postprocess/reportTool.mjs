import { tool } from "@langchain/core/tools";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import z from "zod";
import { getUserPromptsDir, getOutputDir } from "../../../utils/appDataPaths.mjs";

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
    const promptsDir = getUserPromptsDir();
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