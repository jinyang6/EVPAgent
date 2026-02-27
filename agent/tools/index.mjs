import { ToolNode } from "@langchain/langgraph/prebuilt";


// Community tools
import { DuckDuckGoSearch } from "@langchain/community/tools/duckduckgo_search";




/**
 * List all the tools here
 */
export const tools = [
            new DuckDuckGoSearch({ maxResults: 5 }),
        ];






export const toolNode = new ToolNode(tools); // Use langGraph build-in ToolNode