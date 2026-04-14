import { ToolNode } from "@langchain/langgraph/prebuilt";

import { readSessionManifestTool } from "./read/readSessionManifest.mjs";
import { listPromptFilesTool } from "./list/listPromptFiles.mjs";
import { readPromptTool } from "./read/readPrompt.mjs";
import { writePromptTool } from "./write/writePrompt.mjs";
import { deletePromptTool } from "./delete/deletePrompt.mjs";

/**
 * List all the tools for PromptRefineAgent
 */
export const tools = [
    readSessionManifestTool,
    listPromptFilesTool,
    readPromptTool,
    writePromptTool,
    deletePromptTool,
];

/**
 * Use langGraph build-in ToolNode
 */
export const toolNode = new ToolNode(tools);