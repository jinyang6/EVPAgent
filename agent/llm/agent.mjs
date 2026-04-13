import { AgentState } from "../graph/state.mjs"
import { createModel } from "./api/OpenAICompatible.mjs";
import { tools } from "../tools/index.mjs"

/**
 * Gets system prompt from config or uses fallback
 * @type {string}
 */
function getSystemPrompt(config) {
  return config?.configurable?.systemPrompt || "You are EVPAgent.";
}

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
       baseURL: "https://openrouter.ai/api/v1",
       apiKey: "sk-xxx...",
       modelId: "google/gemini-3-flash-preview"
  }
 * @returns The response of the llm, to be appended to chat history by framework using reducer
 */
export async function callModel(state, config) {
    
    const messages = state.messages;
    const { baseURL, apiKey, modelId, systemPrompt } = config.configurable;

    // Inject system prompt as first message
    const fullMessages = [
        { role: "system", content: getSystemPrompt(config) },
        ...messages
    ];

    // Create chat model with OpenAI-compatible API config
    const provider = createModel({
        baseURL,
        apiKey,
        modelId
    }).bindTools(tools);

    // Inference
    const response = await provider.invoke(fullMessages);
    
    return { messages: [ response ] };
    
};