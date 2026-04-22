/**
 * SysAgent - Simple Pipeline Agent
 *
 * Flow: compose -> search -> refine
 *
 * Usage:
 *   const agent = new SysAgent();
 *   await agent.init();
 *   for await (const chunk of agent.stream("query")) { ... }
 */

import { composerGraph } from "../PromptComposerAgent/graph.mjs";
import { searchGraph } from "../SearchAgent/graph.mjs";
import { refineGraph } from "../PromptRefineAgent/graph.mjs";
import { getPromptsDir, getConfigDir, getScriptDir } from "./utils/paths.mjs";
import { readJson, readFile } from "./utils/files.mjs";
import { textChunk, toolChunk, isNonEmptyString } from "./types/chunk.mjs";
import { getStats, resetResponseStats } from "../SearchAgent/tools/stats.mjs";
import { resetVectorDB as resetVectorDBInternal } from "../SearchAgent/tools/vector/vectorHelpers.mjs";
import { existsSync, cpSync, mkdirSync, readdirSync, unlinkSync } from "fs";
import { join } from "path";

// ═══════════════════════════════════════════════════════════════════════════════
// SysAgent
// ═══════════════════════════════════════════════════════════════════════════════

export class SysAgent {
  // ─────────────────────────────────────────────────────────────────────────────
  // Constructor
  // ─────────────────────────────────────────────────────────────────────────────

  constructor(config = {}) {
    this.baseConfig = {
      configurable: {
        baseURL: config.baseURL || process.env.SEARCH_MODEL_BASE_URL,
        apiKey: config.apiKey || process.env.SEARCH_MODEL_API_KEY,
        modelId: config.modelId || process.env.SEARCH_MODEL_ID,
      },
      recursionLimit: 100,
    };
    this._initialized = false;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────────

  /** Stream results as async generator */
  async *stream(userQuery) {
    if (!this._initialized) await this.init();
    yield* this.compose(userQuery);
    yield* this.search(userQuery);
    yield* this.refine();
  }

  /** Collect all chunks into array */
  async invoke(userQuery) {
    const chunks = [];
    for await (const chunk of this.stream(userQuery)) {
      chunks.push(chunk);
    }
    return chunks;
  }

  /** Get cache stats */
  getStats() {
    return getStats();
  }

  /** Reset response stats */
  resetStats() {
    resetResponseStats();
  }

  /** Reset vector DB - delete all cached data */
  async resetVectorDB() {
    await resetVectorDBInternal();
  }

  /** Reset prompts to default */
  resetPrompts() {
    const promptsDir = getPromptsDir();
    for (const subdir of ["Loop", "Rephrase"]) {
      const dir = join(promptsDir, subdir);
      if (!existsSync(dir)) continue;
      for (const file of readdirSync(dir)) {
        if (file.endsWith(".json")) {
          unlinkSync(join(dir, file));
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Initialization
  // ─────────────────────────────────────────────────────────────────────────────

  /** Initialize: ensure config and prompt files exist */
  async init() {
    if (this._initialized) return;
    this._ensureConfigFiles();
    this._ensurePromptFiles();
    this._initialized = true;
  }

  /** Ensure config files are in user directory */
  _ensureConfigFiles() {
    const userDir = getConfigDir();
    const distDir = join(getScriptDir(), "prompts", "config");

    if (!existsSync(userDir)) {
      mkdirSync(userDir, { recursive: true });
    }

    for (const file of ["system_prompt.md", "Rephrase.md", "Loop.md"]) {
      const src = join(distDir, file);
      const dest = join(userDir, file);
      if (existsSync(src)) cpSync(src, dest, { force: true });
    }
  }

  /** Ensure prompt subdirectories exist and copy defaults */
  _ensurePromptFiles() {
    const userDir = getPromptsDir();
    const distDir = join(getScriptDir(), "prompts", "dynamic_prompts");

    for (const subdir of ["Loop", "Rephrase"]) {
      const userSubDir = join(userDir, subdir);
      const distSubDir = join(distDir, subdir);

      if (!existsSync(userSubDir)) {
        mkdirSync(userSubDir, { recursive: true });
      }

      if (existsSync(distSubDir)) {
        for (const file of readdirSync(distSubDir)) {
          cpSync(join(distSubDir, file), join(userSubDir, file), { force: true });
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Pipeline Steps
  // ─────────────────────────────────────────────────────────────────────────────

  /** Step 1: Compose dynamic system prompt */
  async *compose(userQuery) {
    const state = { messages: [{ role: "user", content: userQuery }] };
    const stream = await composerGraph.stream(state, this.baseConfig);
    for await (const chunk of stream) {
      yield* this.#yieldChunk(chunk);
    }
  }

  /** Step 2: Search using dynamic system prompt */
  async *search(userQuery) {
    const config = {
      ...this.baseConfig,
      configurable: { ...this.baseConfig.configurable, systemPrompt: this.#getSystemPrompt() },
    };
    const state = { messages: [{ role: "user", content: userQuery }] };
    const stream = await searchGraph.stream(state, config);
    for await (const chunk of stream) {
      yield* this.#yieldChunk(chunk);
    }
  }

  /** Step 3: Refine prompts (only if search succeeded) */
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

  /** Get system prompt (dynamic or default with placeholders filled) */
  #getSystemPrompt() {
    // Try dynamic prompt first
    const dynamicPath = join(getPromptsDir(), "dynamic_system_prompt.md");
    const dynamic = readFile(dynamicPath);
    if (dynamic) return dynamic;

    // Build default prompt with placeholders replaced
    const configDir = getConfigDir();
    let prompt = readFile(join(configDir, "system_prompt.md")) || "You are a helpful assistant.";

    for (const [placeholder, fileName] of Object.entries({
      "${Rephrase}": "Rephrase.md",
      "${Loop}": "Loop.md",
    })) {
      const content = readFile(join(configDir, fileName));
      if (content) prompt = prompt.replace(placeholder, content);
    }
    return prompt;
  }

  /** Check if search was successful */
  #checkSearchSuccess() {
    const manifest = readJson(join(getPromptsDir(), "session_manifest.json"));
    return manifest?.searchSuccess === true;
  }

  /** Yield chunk from LangGraph output */
  * #yieldChunk(chunk) {
    const delta = this.#extractDelta(chunk);
    if (delta) yield delta;
  }

  /** Extract OpenAI-compatible delta from LangGraph chunk */
  #extractDelta(chunk) {
    if (!chunk) return null;

    for (const [, nodeState] of Object.entries(chunk)) {
      if (!nodeState?.messages?.length) continue;
      const msg = nodeState.messages[nodeState.messages.length - 1];
      if (!msg) continue;

      // Tool call
      if (msg.tool_calls?.length) {
        const tc = msg.tool_calls[0];
        return toolChunk(tc.name, tc.args || {});
      }

      // Skip tool result messages (internal)
      if (msg.role === "tool") continue;

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