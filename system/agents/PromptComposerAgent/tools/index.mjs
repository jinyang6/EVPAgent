import { ToolNode } from "@langchain/langgraph/prebuilt";

import { readSystemPromptTool } from "./read/readSystemPrompt.mjs";
import { listPromptFilesTool } from "./list/listPromptFiles.mjs";
import { combinePromptsTool } from "./combine/combinePrompts.mjs";

/**
 * List all the tools for PromptComposerAgent
 */
export const tools = [
    readSystemPromptTool,
    listPromptFilesTool,
    combinePromptsTool,
];

/**
 * Use langGraph build-in ToolNode
 */
export const toolNode = new ToolNode(tools);