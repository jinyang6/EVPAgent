import { ChatOpenAI } from "@langchain/openai";


/**
 * This file defines the openrouter
 * adapter. In openrouter, the llm calls 
 * can be used uniformly across providers.
 */


/**
 * The Openrouter adapter to
 * warp langchain/openai and change
 * its base url.
 * @param {String} modelID The openrouter model ID, 
 * for example google/gemini-3-flash-preview.
 * @param {String} key The openrouter inference api key.
 * @returns The modified ChatOpenAI object to 
 * send requests to openrouter api.
 */
export const chatOpenrouter = (modelID, key) => {
    
    return new ChatOpenAI({
        model: modelID,
        apiKey: key,
        configuration: {
            baseURL: "https://openrouter.ai/api/v1",
            defaultHeaders: {
                "HTTP-Referer": "https://jinyang6.github.io/chatanyllm-agentic",
                "X-Title": "chatanyllm-agentic"
            }
        }
    })
}