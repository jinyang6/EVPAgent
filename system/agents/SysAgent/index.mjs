/**
 * SysAgent - Simple Pipeline Agent
 *
 * Flow: compose -> search -> refine
 *
 * Usage:
 *   const agent = createSysAgent({ baseURL, apiKey, modelId });
 *   for await (const chunk of agent.stream("query")) { ... }
 */

import { composerGraph } from "../PromptComposerAgent/graph.mjs";
import { searchGraph } from "../SearchAgent/graph.mjs";
import { refineGraph } from "../PromptRefineAgent/graph.mjs";
import { getPromptsDir, getConfigDir } from "./utils/paths.mjs";
import { readJson, readFile } from "./utils/files.mjs";
import { textChunk, toolChunk, isNonEmptyString } from "./types/chunk.mjs";

// ═══════════════════════════════════════════════════════════════════════════════
// SysAgent
// ═══════════════════════════════════════════════════════════════════════════════

export class SysAgent {
  /**
   * @param {Object} config
   * @param {string} config.baseURL
   * @param {string} config.apiKey
   * @param {string} config.modelId
   */
  constructor({ baseURL, apiKey, modelId }) {
    this.baseConfig = {
      configurable: { baseURL, apiKey, modelId },
      recursionLimit: 100,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Stream results as async generator
   * @param {string} userQuery
   */
  async *stream(userQuery) {
    yield* this.compose(userQuery);
    yield* this.search(userQuery);
    yield* this.refine();
  }

  /**
   * Collect all chunks into array
   * @param {string} userQuery
   * @returns {Promise<Array>}
   */
  async invoke(userQuery) {
    const chunks = [];
    for await (const chunk of this.stream(userQuery)) {
      chunks.push(chunk);
    }
    return chunks;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Pipeline Steps
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Step 1: Compose dynamic system prompt
   */
  async *compose(userQuery) {
    const state = { messages: [{ role: "user", content: userQuery }] };
    const stream = await composerGraph.stream(state, this.baseConfig);

    for await (const chunk of stream) {
      yield* this.#yieldChunk(chunk);
    }
  }

  /**
   * Step 2: Search using dynamic system prompt
   */
  async *search(userQuery) {
    const systemPrompt = this.#getSystemPrompt();
    const config = {
      ...this.baseConfig,
      configurable: { ...this.baseConfig.configurable, systemPrompt },
    };
    const state = { messages: [{ role: "user", content: userQuery }] };
    const stream = await searchGraph.stream(state, config);

    for await (const chunk of stream) {
      yield* this.#yieldChunk(chunk);
    }
  }

  /**
   * Step 3: Refine prompts (only if search succeeded)
   */
  async *refine() {
    if (!this.#checkSearchSuccess()) return;

    const state = { messages: [] };
    const stream = await refineGraph.stream(state, this.baseConfig);

    for await (const chunk of stream) {
      yield* this.#yieldChunk(chunk);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get system prompt (dynamic or default)
   */
  #getSystemPrompt() {
    // Try dynamic prompt first
    const dynamicPath = `${getPromptsDir()}/dynamic_system_prompt.md`;
    const dynamic = readFile(dynamicPath);
    if (dynamic) return dynamic;

    // Build default prompt
    const configPath = `${getConfigDir()}/system_prompt.md`;
    let prompt = readFile(configPath) || "You are a helpful assistant.";

    // Replace placeholders
    const replacements = { "${Rephrase}": "Rephrase.md", "${Loop}": "Loop.md" };
    for (const [placeholder, fileName] of Object.entries(replacements)) {
      const filePath = `${getConfigDir()}/${fileName}`;
      const content = readFile(filePath);
      if (content) {
        prompt = prompt.replace(placeholder, content);
      }
    }
    return prompt;
  }

  /**
   * Check if search was successful
   */
  #checkSearchSuccess() {
    const manifest = readJson(`${getPromptsDir()}/session_manifest.json`);
    return manifest?.searchSuccess === true;
  }

  /**
   * Yield chunk from LangGraph output
   */
  * #yieldChunk(chunk) {
    const delta = this.#extractDelta(chunk);
    if (delta) yield delta;
  }

  /**
   * Extract OpenAI-compatible delta from LangGraph chunk
   */
  #extractDelta(chunk) {
    if (!chunk) return null;

    for (const [, nodeState] of Object.entries(chunk)) {
      if (!nodeState?.messages?.length) continue;

      const msg = nodeState.messages[nodeState.messages.length - 1];
      if (!msg) continue;

      // Tool call
      if (msg.tool_calls?.length) {
        const tc = msg.tool_calls[0];
        return toolChunk(tc.name, tc.arguments || {});
      }

      // Text content
      if (isNonEmptyString(msg.content)) {
        return textChunk(msg.content);
      }
    }
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Factory
// ═══════════════════════════════════════════════════════════════════════════════

export function createSysAgent(config) {
  return new SysAgent(config);
}
