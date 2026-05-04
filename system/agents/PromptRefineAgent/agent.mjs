import { RefineState } from "./state.mjs"
import { createModel } from "../llm/api/OpenAICompatible.mjs";
import { tools } from "./tools/index.mjs"

/**
 * System prompt for PromptRefineAgent
 */
const REFINE_SYSTEM_PROMPT = `You are the PromptRefineAgent, responsible for analyzing search sessions and optimizing prompt files to lower search cost and increase answer quality.

Your task:
1. Read session_manifest.json to understand the current session (query, prompts used, search history, outcomes)
2. Check if "searchSuccess" is true or false in the manifest
3. If searchSuccess is FALSE: Do nothing. Return immediately without calling any tools or making any changes.
4. If searchSuccess is TRUE: Continue with analysis and prompt optimization below.

CRITICAL: If the manifest shows searchSuccess is false, do NOT call any tools, do NOT analyze prompts, do NOT make any changes. Simply end your turn without response.

Only proceed with the following if searchSuccess is TRUE:
5. Read the prompt files that were used (Rephrase.md, Loop.md, rover_system_prompt.md) to understand their content
6. Analyze whether the prompts were effective for the query
7. Decide to: update existing prompts, create new ones, or delete redundant ones

Goals:
- LOWER SEARCH COST: Reduce unnecessary tool calls, redundant searches, and inefficient patterns
- INCREASE SUCCESS RATE: Help future searches find more relevant Wikipedia content faster
- IMPROVE ANSWER QUALITY: Get more comprehensive, accurate answers from Wikipedia

Analysis criteria:
- Was the search history productive? (good tool calls, relevant results, no redundant loops)
- Were the selected prompts appropriate for the query complexity?
- Was the search plan efficient? Could fewer searches have achieved the same result?
- Did the rephrasing/derivation strategy work well?
- Were search terms optimal for finding relevant Wikipedia articles?
- Did the agent get stuck in loops or make unnecessary calls?
- Could improving prompts (Rephrase, Loop) make ALL future searches better?
- Should add new prompts (Rephrase, Loop) make generic topic searches better?

After finishing your analysis and any prompt changes, simply end your turn. Do NOT call any more tools.`;

/**
 * This function is the agent node's callback function,
 * used in graph.mjs to define the workflow.
 * It takes the state/data and sends the chat messages 
 * to the llm and returns the llm's response.
 * @param {typeof RefineState} state The state of the graph
 * @param {Object} config The configuration of the provider
 * @returns The response of the llm
 */
export async function callModel(state, config) {
    const { baseURL, apiKey, modelId } = config.configurable;
    const messages = state.messages;

    // Create chat model with tools
    const provider = createModel({
        baseURL,
        apiKey,
        modelId
    }).bindTools(tools);

    // Build messages with system prompt and all previous messages from state
    // Always include at least one user message (some APIs require it)
    const fullMessages = [
        { role: "system", content: REFINE_SYSTEM_PROMPT },
        ...(messages.length > 0 ? messages : [{ role: "user", content: "Please analyze the session and refine prompts as needed." }])
    ];

    // Inference
    const response = await provider.invoke(fullMessages);
    
    return { messages: [response] };
}