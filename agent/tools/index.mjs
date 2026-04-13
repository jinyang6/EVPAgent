import path from "node:path";
import { ToolNode } from "@langchain/langgraph/prebuilt";


// Community tools
// import { DuckDuckGoSearch } from "@langchain/community/tools/duckduckgo_search";
// import { ReadFileTool } from "@langchain/classic/tools"; 
// import { NodeFileStore } from "@langchain/classic/stores/file/node"; 


// Self-defined tools
import { searchWikipediaTool } from "./wikipedia/searchWikipedia.mjs";
import { fetchWikiPageTool } from "./wikipedia/fetchWikiPage.mjs";
// import { webSearchTool } from "./web/webSearchTool.mjs"; 
// import { fetchUrlTool } from "./web/webFetchTool.mjs"; 
// import { searchBaikeTool } from "./web/searchBaike.mjs"; 



/**
 * List all the tools here
 */
// const store = new NodeFileStore({ 
//   rootPath: path.resolve(process.cwd(), "workspace") 
// });
export const tools = [
            // webSearchTool, 
            // fetchUrlTool, 
            searchWikipediaTool,
            fetchWikiPageTool,
            // searchBaikeTool, 
            // new ReadFileTool({ store }), 
        ];






export const toolNode = new ToolNode(tools); // Use langGraph build-in ToolNode