import { ToolNode } from "@langchain/langgraph/prebuilt";

import { readSessionManifestTool } from "./read/readSessionManifest.mjs";
import { readSystemPromptTool } from "./read/readSystemPrompt.mjs";
import { listPromptFilesTool } from "./list/listPromptFiles.mjs";
import { readPromptTool } from "./read/readPrompt.mjs";
import { writePromptTool } from "./write/writePrompt.mjs";
import { writeSystemPromptTool } from "./write/writeSystemPrompt.mjs";
import { deletePromptTool } from "./delete/deletePrompt.mjs";

/**
 * List all the tools for PromptRefineAgent
 */
export const tools = [
    readSessionManifestTool,
    readSystemPromptTool,
    listPromptFilesTool,
    readPromptTool,
    writePromptTool,
    writeSystemPromptTool,
    deletePromptTool,
];

/**
 * Use langGraph build-in ToolNode
 */
export const toolNode = new ToolNode(tools);