import { ChatAnthropic } from "@langchain/anthropic";

/**
 * Create a DeepSeek chat model instance using the Anthropic compatibility layer.
 *
 * DeepSeek supports the Anthropic Messages API format at:
 *   https://api.deepseek.com/anthropic
 *
 * ChatAnthropic sends Anthropic-format requests (x-api-key header,
 * content arrays, tool_use/tool_result blocks) which DeepSeek accepts.
 * Unsupported model names are auto-mapped to deepseek-v4-flash.
 *
 * @param {Object} config - Configuration object
 * @param {string} [config.baseURL] - API base URL (defaults to https://api.deepseek.com/anthropic)
 * @param {string} config.apiKey - DeepSeek API key
 * @param {string} config.modelId - Model identifier (e.g., "deepseek-chat", "deepseek-v4-flash")
 * @returns {ChatAnthropic} Configured instance
 */
export const createModel = ({ baseURL, apiKey, modelId }) => {
    return new ChatAnthropic({
        model: modelId,
        anthropicApiKey: apiKey,
        timeout: 120_000,
        maxRetries: 3,
        clientOptions: {
            baseURL: baseURL || "https://api.deepseek.com/anthropic",
        },
    });
};
