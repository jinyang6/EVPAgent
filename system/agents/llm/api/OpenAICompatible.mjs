import { ChatOpenAI } from "@langchain/openai";


/**
 * Create an OpenAI-compatible chat model instance.
 * @param {Object} config - Configuration object
 * @param {string} config.baseURL - API base URL (e.g., "https://openrouter.ai/api/v1")
 * @param {string} config.apiKey - API key for authentication
 * @param {string} config.modelId - Model identifier (e.g., "google/gemini-3-flash-preview")
 * @returns {ChatOpenAI} Configured ChatOpenAI instance
 */
export const createModel = ({ baseURL, apiKey, modelId }) => {
    return new ChatOpenAI({
        model: modelId,
        apiKey: apiKey,
        configuration: {
            baseURL: baseURL,
            defaultHeaders: {
                "HTTP-Referer": "https://github.com/jinyang6/EVPAgent",
                "X-Title": "EVPAgent"
            }
        }
    });
};