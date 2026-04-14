import path from "node:path";
import { ToolNode } from "@langchain/langgraph/prebuilt";

// Self-defined tools
import { searchWikipediaTool } from "./wikipedia/searchWikipedia.mjs";
import { fetchWikiPageTool } from "./wikipedia/fetchWikiPage.mjs";
import { reportTool } from "./postprocess/reportTool.mjs";

/**
 * List all the tools here
 */
export const tools = [
    searchWikipediaTool,
    fetchWikiPageTool,
    reportTool,
];

/**
 * Use langGraph build-in ToolNode
 */
export const toolNode = new ToolNode(tools);