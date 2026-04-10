import { AgentState } from "../graph/state.mjs"
import { chatOpenrouter } from "./openrouter/Openrouter.mjs";
import { tools } from "../tools/index.mjs"

/**
 * System prompt injected at build time via esbuild define
 * @type {string}
 */
const SYSTEM_PROMPT = typeof __SYSTEM_PROMPT__ !== 'undefined' 
  ? __SYSTEM_PROMPT__ 
  : "You are EVPAgent.";

/**
 * This file contains the definitions
 * of the main agent node.
 */


/**
 * This function is the main agent node's 
 * callback function, used in graph.ts to
 * define the workflow.
 * It takes the state/data and send 
 * the chat messages to the llm and 
 * returns the llm's response to the framework.
 * @param {typeof AgentState} state The state of the graph, containing data to store/process
 * @param {Object} config The configuration of the provider, for example 
 
 { 
 
      modelID: "google/gemini-3-flash-preview",
      apiKey: "sk-xxx..."
 
 } 
 * @returns The response of the llm, to be appended to chat history by framework using reducer
 */
export async function callModel(state, config) {
    
    const messages = state.messages;
    const modelID = config.configurable.model;
    const apiKey = config.configurable.key;

    // Inject system prompt as first message
    const fullMessages = [
        { role: "system", content: SYSTEM_PROMPT },
        ...messages
    ];

    // Use openrouter as provider
    const provider = chatOpenrouter(modelID, apiKey).bindTools(tools);

    // Inference
    const response = await provider.invoke(fullMessages);
    
    return { messages: [ response ] };
    
};