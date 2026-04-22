import { ComposerState } from "./state.mjs"
import { createModel } from "../llm/api/OpenAICompatible.mjs";
import { tools } from "./tools/index.mjs"

/**
 * System prompt for PromptComposerAgent
 */
const COMPOSER_SYSTEM_PROMPT = `You are the PromptComposerAgent, responsible for selecting and combining prompt files for a user query.

Your task:
1. Read the base system prompt
2. Call list available prompts for BOTH "Rephrase" folder and "Loop" folder
3. Select prompts for BOTH "Rephrase" folder and "Loop" folder
4. Call combinePrompts with your selection
5. Done

IMPORTANT: 
- MUST follow the above steps
- After calling combinePrompts, simply return a message saying "Done" - do NOT call any more tools.`;

/**
 * This function is the agent node's callback function,
 * used in graph.mjs to define the workflow.
 * It takes the state/data and sends the chat messages 
 * to the llm and returns the llm's response.
 * @param {typeof ComposerState} state The state of the graph
 * @param {Object} config The configuration of the provider
 * @returns The response of the llm
 */
export async function callModel(state, config) {
    const messages = state.messages;
    
    const { baseURL, apiKey, modelId } = config.configurable;

    // Create chat model with tools
    const provider = createModel({
        baseURL,
        apiKey,
        modelId
    }).bindTools(tools);

    // Build messages - start with system prompt, then user query, then all previous messages
    const userQuery = messages.length > 0 ? messages[0].content : "";
    
    const fullMessages = [
        { role: "system", content: COMPOSER_SYSTEM_PROMPT },
        { role: "user", content: `User query: "${userQuery}"\n\nPlease select appropriate prompts and call combinePrompts.` }
    ];
    
    // Add previous messages (tool results) if any
    for (const msg of messages) {
        if (msg.role !== 'system') {
            fullMessages.push(msg);
        }
    }

    // Inference
    const response = await provider.invoke(fullMessages);
    
    return { messages: [response] };
}