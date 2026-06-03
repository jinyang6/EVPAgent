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
import { refineGraph } from "../PromptRefineAgent/graph.mjs";
import { mainGraph } from "../MainAgent/graph.mjs";
import { getPromptsDir, getConfigDir, getScriptDir } from "./utils/paths.mjs";
import { readFile, readJson } from "./utils/files.mjs";
import { textChunk, toolChunk, doneChunk, isNonEmptyString } from "./types/chunk.mjs";
import { getStats, resetResponseStats } from "../MainAgent/tools/stats.mjs";
import { resetVectorDB as resetVectorDBInternal } from "../MainAgent/tools/vector/vectorHelpers.mjs";
import { existsSync, cpSync, mkdirSync, readdirSync, unlinkSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { getOutputDir } from "../utils/appDataPaths.mjs";
import { getConfig } from "../../../src/config.mjs";

// ═══════════════════════════════════════════════════════════════════════════════
// SysAgent
// ═══════════════════════════════════════════════════════════════════════════════

export class SysAgent {
  // ─────────────────────────────────────────────────────────────────────────────
  // Constructor & Config
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Create a new SysAgent instance.
   *
   * Configures the LangGraph baseConfig with LLM settings and optional tool filtering.
   * The `tools` option accepts a boolean map to enable/disable specific tools:
   * `{ searchWikipedia: true, fetchWikiPage: true }`
   * `report` is always enabled regardless of this setting.
   * `null` or omitted means all tools enabled.
   *
   * @param {Object} config - Configuration options
   * @param {string} [config.baseURL] - LLM API base URL (defaults to config.json searchModel.baseUrl)
   * @param {string} [config.apiKey] - LLM API key (user-provided via Settings; no default)
   * @param {string} [config.modelId] - LLM model identifier (defaults to config.json searchModel.modelId)
   * @param {Object|null} [config.tools] - Boolean map for tool filtering
   */
  constructor(config = {}) {
    const { searchModel } = getConfig();
    this.baseConfig = {
      configurable: {
        // Explicit config always wins; fall back to config.json
        baseURL: config.baseURL || searchModel.baseUrl,
        apiKey: config.apiKey || null,           // API key comes from Settings (user-provided), not config.json
        modelId: config.modelId || searchModel.modelId,
        tools: config.tools || null,  // {searchWikipedia: true, fetchWikiPage: false} — null = all enabled
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
   * @param {Array<{role: string, content: string}>} messages - Chat history (CLI-maintained)
   * @param {'probe'|'rover'} mode - Workflow mode: probe (fast) or rover (in-depth)
   * @param {Object} [opts]
   * @param {AbortSignal} [opts.signal] - Abort signal to cancel execution
   * @param {string} [opts.apiKey] - API key override (applied per-call; allows reuse of a pre-created instance)
   */
  async *stream(messages, mode = 'probe', { signal, apiKey } = {}) {
    if (!this._initialized) await this.init();

    // Apply API key override — allows AgentService to inject the key when
    // reusing a pre-created agent (e.g. CLI mode where SysAgent is created
    // before the first HTTP call provides the key).
    if (apiKey) {
      this.baseConfig.configurable.apiKey = apiKey;
    }

    // Reset session files for fresh query
    this.#resetSessionFiles();

    // Tool config per mode — report always enabled automatically
    const tools = mode === 'probe'
      ? { searchWikipedia: true, fetchWikiPage: true, fetch_url: true, deepSearch: true }
      : { searchWikipedia: true, fetchWikiPage: true, fetch_url: true };

    if (mode === 'probe') {
      // Probe mode: pass full chat history for multi-turn context
      yield* this.#runMainAgent(messages, this.#getProbePrompt(), tools, signal);
    } else {
      // Rover mode: last user message only (fresh research context)
      const userQuery = messages.findLast(m => m.role === "user")?.content || "";
      yield* this.#compose(userQuery, signal);
      yield* this.#runMainAgent([{ role: "user", content: userQuery }], this.#getRoverPrompt(), tools, signal);
      yield* this.#refine(signal);
    }

    // Yield output.md as final chunk (written by report tool)
    const outputContent = this.#readOutputFile();
    if (outputContent) yield textChunk(outputContent);
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

  /**
   * Check session manifest to determine if the last search was successful.
   * @returns {boolean} True if search succeeded
   */
  wasSearchSuccessful() {
    return this.#checkSearchSuccess();
  }

  /**
   * Reset session files to clean state.
   * Exposed for subagent callers (e.g., deepSearch tool) to prevent
   * polluting the caller's session manifest and output.
   */
  resetSession() {
    this.#resetSessionFiles();
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
   * @param {AbortSignal} [signal]
   */
  async *#compose(userQuery, signal) {
    const state = { messages: [{ role: "user", content: userQuery }] };
    const config = { ...this.baseConfig, signal };
    const stream = await composerGraph.stream(state, config);
    for await (const chunk of stream) {
      yield* this.#yieldChunk(chunk);
    }
  }

  /**
   * Step 2: Run MainAgent with given messages, system prompt and tool set
   * @param {Array<{role: string, content: string}>} messages - Messages to send as initial state
   * @param {string} systemPrompt - System prompt to use
   * @param {Object} tools - Boolean map of enabled tools
   * @param {AbortSignal} [signal]
   */
  async *#runMainAgent(messages, systemPrompt, tools, signal) {
    const config = {
      ...this.baseConfig,
      configurable: {
        ...this.baseConfig.configurable,
        systemPrompt: systemPrompt,
        tools: tools,
      },
      signal,
    };
    const state = { messages };
    const stream = await mainGraph.stream(state, config);
    for await (const chunk of stream) {
      yield* this.#yieldChunk(chunk);
    }
  }

  /**
   * Step 3: Refine prompts based on search results
   * Uses PromptRefineAgent to improve Rephrase and Loop prompts
   * Only runs if search was successful
   * @param {AbortSignal} [signal]
   */
  async *#refine(signal) {
    if (!this.#checkSearchSuccess()) return;
    const state = { messages: [] };
    const config = { ...this.baseConfig, signal };
    const stream = await refineGraph.stream(state, config);
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
   * Read output.md content after agent finishes (written by report tool)
   * @returns {string|null} Output content or null if file empty/missing
   */
  #readOutputFile() {
    const outputPath = join(getOutputDir(), "output.md");
    if (!existsSync(outputPath)) return null;
    const content = readFileSync(outputPath, 'utf-8').trim();
    return content || null;
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