import { AgentState } from "../state.mjs"
import { chatOpenrouter } from "./Openrouter/Openrouter.mjs";

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
 * 
 * { 
 * 
 *      modelID: "google/gemini-3-flash-preview",
 *      apiKey: "sk-xxx..."
 * 
 *  } 
 * @returns The response of the llm, to be appended to chat history by framework using reducer
 */
export async function callModel(state, config) {
    
    const messages = state.messages;
    const modelID = config.modelID;
    const apiKey = config.apiKey;

    // Use openrouter as provider
    const provider = chatOpenrouter(modelID, apiKey);

    // Inference
    const response = await provider.invoke(messages);
    
    return { messages: [ response ] };
    
};
