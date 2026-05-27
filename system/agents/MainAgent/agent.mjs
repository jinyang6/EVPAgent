import { AgentState } from "./state.mjs"
import { createModel } from "../llm/api/OpenAICompatible.mjs"
import { tools } from "./tools/index.mjs"

// ═══════════════════════════════════════════════════════════════════════════════
// Main Agent — LLM Node
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Call the LLM with the current agent state and return its response.
 *
 * Used by mainGraph as the "agent" node callback. Reads messages from state,
 * injects the system prompt, binds available tools, and streams the result
 * back to the graph for appending to chat history.
 *
 * Tool filtering:
 * - `report` is always enabled regardless of config
 * - Other tools (searchWikipedia, fetchWikiPage, fetch_url) are controlled by the
 *   `config.configurable.tools` boolean map, e.g.:
 *   `{ searchWikipedia: true, fetchWikiPage: false }`
 * - If `tools` is not set (null), all tools are enabled
 *
 * @param {typeof AgentState} state — Graph state containing messages array
 * @param {Object} config — Runtime configuration passed by LangGraph
 * @param {Object} config.configurable — LLM and tool settings
 * @param {string} config.configurable.baseURL — API base URL
 * @param {string} config.configurable.apiKey — API key
 * @param {string} config.configurable.modelId — Model identifier
 * @param {string} [config.configurable.systemPrompt] — System prompt string
 * @param {Object|null} [config.configurable.tools] — Boolean map for tool filtering
 * @returns {Promise<{ messages: Array }>} LLM response to append to messages
 */
export async function callModel(state, config) {
     
    const messages = state.messages;
    const { baseURL, apiKey, modelId, systemPrompt, tools: allowedTools } = config.configurable;
    const ALWAYS_ENABLED = ['report'];

    // Filter tools: report always enabled, others controlled by boolean map
    const activeTools = allowedTools
      ? tools.filter(t => ALWAYS_ENABLED.includes(t.name) || allowedTools[t.name] === true)
      : tools;

    // Inject system prompt as first message
    const fullMessages = [
        { role: "system", content: systemPrompt || "You are EVPAgent." },
        ...messages
    ];

    // Create chat model with OpenAI-compatible API config
    const provider = createModel({
        baseURL,
        apiKey,
        modelId
    }).bindTools(activeTools);

    const response = await provider.invoke(fullMessages);
    return { messages: [ response ] };
    
};