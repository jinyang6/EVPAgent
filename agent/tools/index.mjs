import { ToolNode } from "@langchain/langgraph/prebuilt";
import { Tool } from "langchain";


/**
 * List all the tools here
 */
const tools = [
    
];






export const toolNode = new ToolNode<Tool>(tools) // Use langGraph build-in ToolNode