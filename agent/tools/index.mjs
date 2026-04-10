import path from "node:path";
import { ToolNode } from "@langchain/langgraph/prebuilt";


// Community tools
// import { DuckDuckGoSearch } from "@langchain/community/tools/duckduckgo_search";
// import { ReadFileTool } from "@langchain/classic/tools";  // Disabled
// import { NodeFileStore } from "@langchain/classic/stores/file/node";  // Disabled


// Self-defined tools
// import { webSearchTool } from "./webSearchTool.mjs";  // Disabled
// import { fetchUrlTool } from "./webFetchTool.mjs";  // Disabled
import { searchWikipediaTool } from "./wikipedia/searchWikipedia.mjs";
import { fetchWikiPageTool } from "./wikipedia/fetchWikiPage.mjs";
// import { searchBaikeTool } from "./searchBaike.mjs";  // Disabled



/**
 * List all the tools here
 */
// const store = new NodeFileStore({ 
//   rootPath: path.resolve(process.cwd(), "workspace") 
// });
export const tools = [
            // webSearchTool,  // Disabled
            // fetchUrlTool,  // Disabled
            searchWikipediaTool,
            fetchWikiPageTool,
            // searchBaikeTool,  // Disabled
            // new ReadFileTool({ store }),  // Disabled
        ];






export const toolNode = new ToolNode(tools); // Use langGraph build-in ToolNode