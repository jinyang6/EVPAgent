/**
 * SysAgent - Simple Pipeline Agent
 *
 * Workflows:
 *   probe (fast): direct search with minimal prompt
 *   rover (in-depth): compose -> search -> refine
 *
 * Usage:
 *   const agent = new SysAgent();
 *   await agent.init();
 *   for await (const chunk of agent.stream("query")) { ... }
 *   for await (const chunk of agent.stream("query", "rover")) { ... }
 */

import { composerGraph } from "../PromptComposerAgent/graph.mjs";
import { mainGraph } from "../MainAgent/graph.mjs";

  import { getStats, resetResponseStats } from "../MainAgent/tools/stats.mjs";

  import { resetVectorDB as resetVectorDBInternal } from "../MainAgent/tools/vector/vectorHelpers.mjs";
import { existsSync, cpSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";

// ═══════════════════════════════════════════════════════════════════════════════
// SysAgent
// ═══════════════════════════════════════════════════════════════════════════════

export class SysAgent {
  // ─────────────────────────────────────────────────────────────────────────────
  // Constructor & Config
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Create a new SysAgent instance
   * @param {Object} config - Configuration options
   * @param {string} config.baseURL - LLM base URL
   * @param {string} config.apiKey - LLM API key
   * @param {string} config.modelId - LLM model ID
   */
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
  // Public API - Entry Points
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Stream results as async generator
   * @param {string} userQuery - The query to search
   * @param {'probe'|'rover'} mode - Workflow mode: probe (fast) or rover (in-depth)
   */
  async *stream(userQuery, mode = 'probe') {
    if (!this._initialized) await this.init();

    // Reset session files for fresh query
    this.#resetSessionFiles();

    if (mode === 'probe') {
      yield* this.#runMainAgent(userQuery, this.#getProbePrompt());
    } else {
      yield* this.#compose(userQuery);
      yield* this.#runMainAgent(userQuery, this.#getRoverPrompt());
      yield* this.#refine();
    }
  }

  /**
   * Collect all chunks into array and return
   * @param {string} userQuery - The query to search
   * @param {'probe'|'rover'} mode - Workflow mode
   * @returns {Promise<Array>} Array of chunks
   */
  async invoke(userQuery, mode = 'probe') {
    const chunks = [];
    for await (const chunk of this.stream(userQuery, mode)) {
      chunks.push(chunk);
    }
    return chunks;
  }

  /**
   * Get cache statistics (vector hits, web requests, etc.)
   * @returns {Object} Stats object
   */
  getStats() {
    return getStats();
  }

  /**
   * Reset response statistics to zero
   */
  resetStats() {
    resetResponseStats();
  }

  /**
   * Delete all data in the vector database (LanceDB)
   * This clears all cached Wikipedia content
   */
  async resetVectorDB() {
    await resetVectorDBInternal();
  }

  /**
   * Reset dynamic prompt files to default versions
   * Removes user-modified Rephrase.json and Loop.json
   */
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

  /**
   * Initialize agent: ensure all config and prompt files exist in user directory
   * Copies default files from dist if they don't exist
   */
  async init() {
    if (this._initialized) return;
    this._ensureConfigFiles();
    this._ensurePromptFiles();
    this._initialized = true;
  }

  /**
   * Ensure config prompt files exist in user directory
   * Copies from system/prompts/config/rover and /probe if missing
   */
  _ensureConfigFiles() {
    const userDir = getConfigDir();
    const distDir = join(getScriptDir(), "config");

    if (!existsSync(userDir)) {
      mkdirSync(userDir, { recursive: true });
    }

    // Copy rover files
    const roverSrc = join(distDir, "rover");
    const roverDest = join(userDir, "rover");
    if (!existsSync(roverDest)) mkdirSync(roverDest, { recursive: true });
    for (const file of ["rover_system_prompt.md", "Loop.md", "Rephrase.md"]) {
      const src = join(roverSrc, file);
      const dest = join(roverDest, file);
      if (existsSync(src)) cpSync(src, dest, { force: true });
    }

    // Copy probe files
    const probeSrc = join(distDir, "probe");
    const probeDest = join(userDir, "probe");
    if (!existsSync(probeDest)) mkdirSync(probeDest, { recursive: true });
    for (const file of ["probe_system_prompt.md"]) {
      const src = join(probeSrc, file);
      const dest = join(probeDest, file);
      if (existsSync(src)) cpSync(src, dest, { force: true });
    }
  }

  /**
   * Ensure dynamic prompt subdirectories exist and copy defaults
   * Creates Loop/ and Rephrase/ subdirectories in user prompts dir
   */
  _ensurePromptFiles() {
    const userDir = getPromptsDir();
    const distDir = join(getScriptDir(), "dynamic_prompts");

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
  // Private - Pipeline Steps
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Step 1: Compose dynamic system prompt (Rover only)
   * Uses PromptComposerAgent to build context-aware system prompt
   * @param {string} userQuery - The query to compose prompt for
   */
  async *#compose(userQuery) {
    const state = { messages: [{ role: "user", content: userQuery }] };
    const stream = await composerGraph.stream(state, this.baseConfig);
    for await (const chunk of stream) {
      yield* this.#yieldChunk(chunk);
    }
  }

  /**
   * Step 2: Run MainAgent with given system prompt
   * @param {string} userQuery - The query to search
   * @param {string} systemPrompt - System prompt to use for this search
   */
  async *#runMainAgent(userQuery, systemPrompt) {
    const config = {
      ...this.baseConfig,
      configurable: {
        ...this.baseConfig.configurable,
        systemPrompt: systemPrompt,
      },
    };
    const state = { messages: [{ role: "user", content: userQuery }] };
    const stream = await mainGraph.stream(state, config);
    for await (const chunk of stream) {
      yield* this.#yieldChunk(chunk);
    }
  }

  /**
   * Step 3: Refine prompts based on search results
   * Uses PromptRefineAgent to improve Rephrase and Loop prompts
   * Only runs if search was successful
   */
  async *#refine() {
    if (!this.#checkSearchSuccess()) return;
    const state = { messages: [] };
    const stream = await refineGraph.stream(state, this.baseConfig);
    for await (const chunk of stream) {
      yield* this.#yieldChunk(chunk);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private - Prompt Loaders
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get system prompt for Rover mode
   * First checks for dynamic prompt file, otherwise builds from rover/rover_system_prompt.md
   * with ${Rephrase} and ${Loop} placeholders replaced
   * @returns {string} Rover system prompt text
   */
  #getRoverPrompt() {
    // Try dynamic prompt first (created by compose step)
    const dynamicPath = join(getPromptsDir(), "dynamic_system_prompt.md");
    const dynamic = readFile(dynamicPath);
    if (dynamic) return dynamic;

    // Build default prompt with placeholders replaced
    const configDir = join(getConfigDir(), "rover");
    let prompt = readFile(join(configDir, "rover_system_prompt.md")) || "You are a helpful assistant.";

    for (const [placeholder, fileName] of Object.entries({
      "${Rephrase}": "Rephrase.md",
      "${Loop}": "Loop.md",
    })) {
      const content = readFile(join(configDir, fileName));
      if (content) prompt = prompt.replace(placeholder, content);
    }
    return prompt;
  }

  /**
   * Get system prompt for Probe mode
   * Loads from probe/probe_system_prompt.md - minimal static prompt
   * @returns {string} Probe system prompt text
   */
  #getProbePrompt() {
    const configDir = join(getConfigDir(), "probe");
    return readFile(join(configDir, "probe_system_prompt.md")) || "You are EVPAgent. Answer using Wikipedia.";
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private - Session Management
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Reset session files for a fresh query
   * Clears session_manifest.json and output.md
   * Called at start of both Probe and Rover pipelines
   */
  #resetSessionFiles() {
    const promptsDir = getPromptsDir();
    const manifestPath = join(promptsDir, 'session_manifest.json');

    // Get output directory (platform-aware)
    const homeDir = process.env.APPDATA || join(process.env.HOME || "", ".evpagent");
    const outputDir = process.platform === 'win32'
      ? join(process.env.APPDATA, "EVPAgent", "output")
      : process.platform === 'darwin'
        ? join(homeDir, "Library", "Application Support", "EVPAgent", "output")
        : join(homeDir, ".config", "evpagent", "output");
    const outputFile = join(outputDir, 'output.md');

    // Reset manifest to empty state
    const emptyManifest = {
      searchHistory: [],
      searchSuccess: false,
      timestamp: new Date().toISOString(),
    };
    writeFileSync(manifestPath, JSON.stringify(emptyManifest, null, 2), 'utf-8');

    // Clear output file
    if (existsSync(outputFile)) {
      writeFileSync(outputFile, '', 'utf-8');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private - Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Check if the last search was successful
   * Reads searchSuccess from session_manifest.json
   * @returns {boolean} True if search succeeded
   */
  #checkSearchSuccess() {
    const manifest = readJson(join(getPromptsDir(), "session_manifest.json"));
    return manifest?.searchSuccess === true;
  }

  /**
   * Yield a chunk from LangGraph output
   * Wraps extraction and handles null
   * @param {Object} chunk - LangGraph output chunk
   */
  * #yieldChunk(chunk) {
    const delta = this.#extractDelta(chunk);
    if (delta) yield delta;
  }

  /**
   * Extract OpenAI-compatible delta from LangGraph chunk
   * Returns tool calls or text content as appropriate chunk format
   * @param {Object} chunk - LangGraph output chunk
   * @returns {Object|null} Delta object or null
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

/**
 * Factory function to create SysAgent with config
 * @param {Object} config - Configuration options
 * @returns {SysAgent} New SysAgent instance
 */
export function createSysAgent(config) {
  return new SysAgent(config);
}