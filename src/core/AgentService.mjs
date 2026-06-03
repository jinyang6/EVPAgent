/**
 * AgentService — Centralized agent lifecycle & model registry
 *
 * Single source of truth consumed by the CLI, the API adapter, and all routes.
 * Exposes:
 *   - Model registry (list, lookup, validation)
 *   - Message validation / normalization
 *   - Unified streaming with tool calls separated from content
 */

import { SysAgent } from '../../system/agents/SysAgent/index.mjs';
import { getConfig } from '../config.mjs';

// ═══════════════════════════════════════════════════════════════════════════════
// Model Registry
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_CONTEXT_LENGTH = 128000;

const MODELS = Object.freeze([
  {
    id: 'probe',
    object: 'model',
    created: 1710000000,
    // owned_by: 'evpagent',
    name: 'probe',
    description: 'General-purpose agent handling simple to complex questions. Maintains multi-turn conversation context and can fetch external sources via web_fetch when editing or researching beyond Wikipedia. For deep investigations, delegates to the rover pipeline as a subagent via deepSearch. Produces multimodal responses with embedded media (images, audio, video) from Wikipedia.',
    supported_modalities: ['text'],
    output_modalities: ['text'],
    pricing: null,
  },
  {
    id: 'rover',
    object: 'model',
    created: 1710000000,
    // owned_by: 'evpagent',
    name: 'rover',
    description: 'Single-question deep research pipeline. Takes one question at a time, composes a dynamic research plan, performs multi-step Wikipedia-only investigation across multiple articles, and returns one complete, citation-backed report. In-depth but stateless — lacks multi-turn conversation context. Best for complex, multi-faceted, or expert-level research questions.',
    supported_modalities: ['text'],
    output_modalities: ['text'],
    pricing: null,
  },
]);

const MODEL_MAP = Object.freeze(Object.fromEntries(MODELS.map(m => [m.id, m])));

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Format a tool call into a readable one-liner.
 *
 * @param {{ name: string, args: Object }} toolCall
 * @returns {string} e.g. "searchWikipedia(query=cats, limit=5)"
 */
function formatToolCall({ name, args }) {
  const params = Object.entries(args || {})
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(', ');
  return `${name}(${params})`;
}

/**
 * Normalize OpenAI messages to clean { role, content } objects.
 * Throws a friendly error with statusCode for the API layer.
 *
 * @param {Array<{role: string, content: string|Array}>} messages
 * @returns {Array<{role: string, content: string}>}
 */
function normalizeMessages(messages) {
  if (!Array.isArray(messages)) {
    throw Object.assign(
      new Error('messages must be an array of { role, content }.'),
      { statusCode: 400, param: 'messages' },
    );
  }
  return messages.map(m => ({
    role: m.role || 'user',
    content:
      typeof m.content === 'string'
        ? m.content
        : Array.isArray(m.content)
          ? m.content.map(p => typeof p === 'string' ? p : p.text || '').join('')
          : String(m.content || ''),
  }));
}

// ═══════════════════════════════════════════════════════════════════════════════
// AgentService
// ═══════════════════════════════════════════════════════════════════════════════

export const AgentService = {

  // ── Initialization ────────────────────────────────────────────────────────

  /** Resolved context length from the provider, or null if not yet fetched */
  _contextLength: null,

  /**
   * Fetch the actual context length of the configured search model
   * from the provider's models endpoint.  Falls back to 128000 on failure.
   *
   * Reads baseUrl and modelId from config.json (searchModel).
   * apiKey is not needed here — context_length is a property of the model, not the key.
   *
   * @returns {Promise<void>}
   */
  async init() {
    const { searchModel: { baseUrl, modelId } } = getConfig();

    if (!baseUrl || !modelId) {
      this._contextLength = DEFAULT_CONTEXT_LENGTH;
      return;
    }

    try {
      const modelsUrl = baseUrl.replace(/\/+$/, '') + '/models';
      const response = await fetch(modelsUrl, {
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const json = await response.json();
      const models = json.data || json.models || [];

      // Match model ID, stripping provider prefix and qualifier suffix
      // e.g. "deepseek/deepseek-v4-flash:nitro" → "deepseek-v4-flash"
      const shortId = modelId.includes('/') ? modelId.split('/').pop() : modelId;
      const baseId = shortId.includes(':') ? shortId.split(':')[0] : shortId;
      const match = (Array.isArray(models) ? models : []).find(m => {
        const id = m.id || m.name || '';
        return id === modelId || id === shortId || id === baseId || id.endsWith('/' + shortId) || id.endsWith('/' + baseId);
      });

      if (match) {
        this._contextLength = match.context_length
          || match.context_window
          || match.contextWindow
          || DEFAULT_CONTEXT_LENGTH;
        console.log(`[AgentService] context_length resolved to ${this._contextLength} for ${modelId}`);
        return;
      }

      console.warn(`[AgentService] model ${modelId} not found in provider listing, using default`);
    } catch (e) {
      console.warn(`[AgentService] could not fetch context length: ${e.message}`);
    }

    this._contextLength = DEFAULT_CONTEXT_LENGTH;
  },

  // ── Model Registry ───────────────────────────────────────────────────────

  /**
   * OpenAI /v1/models shape.
   * @returns {{ object: 'list', data: Array }}
   */
  listModels() {
    return { object: 'list', data: this._injectContextLength(MODELS) };
  },

  /**
   * Get a single model by id.
   * @param {string} id - e.g. "probe"
   * @returns {Object|null} Model object or null
   */
  getModel(id) {
    const model = MODEL_MAP[id];
    if (!model) return null;
    return this._injectContextLength([model])[0];
  },

  /**
   * Check whether a model id is valid.
   * @param {string} id
   * @returns {boolean}
   */
  isValidModel(id) {
    return id in MODEL_MAP;
  },

  /**
   * Map a model id to a mode. Unknown → 'probe'.
   * @param {string} model
   * @returns {'probe'|'rover'}
   */
  resolveMode(model) {
    return MODEL_MAP[model] ? model : 'probe';
  },

  // ── Private ──────────────────────────────────────────────────────────────

  /**
   * Spread the dynamic context_length into model objects.
   * @param {Array<Object>} models
   * @returns {Array<Object>}
   */
  _injectContextLength(models) {
    const len = this._contextLength || DEFAULT_CONTEXT_LENGTH;
    return models.map(m => ({ ...m, context_length: len }));
  },

  // ── Input Validation ─────────────────────────────────────────────────────

  /**
   * Validate and normalize an incoming messages array.
   * Used by the chat route before delegating to the adapter.
   *
   * @param {any} messages
   * @returns {Array<{role: string, content: string}>}
   * @throws {Error} with { statusCode, param } on invalid input
   */
  validateMessages(messages) {
    return normalizeMessages(messages);
  },

  // ── Streaming ────────────────────────────────────────────────────────────

  /**
   * Stream agent execution as normalized events.
   *
   * Tool calls are yielded immediately.  Content chunks overwrite a buffer
   * variable — only the last one (output.md) is yielded when the stream ends.
   *
   * Yields:
   *   { type: 'tool',    text: string }  — each tool invocation (real-time)
   *   { type: 'content', text: string }  — terminal output only (at stream end)
   *
   * @param {Array<{role: string, content: string}>} messages
   * @param {'probe'|'rover'} mode
   * @param {Object} [opts]
   * @param {SysAgent} [opts.agent] - Reuse an existing instance (CLI keeps stats)
   * @param {AbortSignal} [opts.signal] - Abort signal to cancel execution
   * @param {string} [opts.apiKey] - OpenRouter API key (overrides .env SEARCH_MODEL_API_KEY)
   * @returns {AsyncGenerator<{ type: string, text: string }>}
   */
  async *streamEvents(messages, mode = 'probe', { agent, signal, apiKey } = {}) {
    console.log('[AgentService] streamEvents started, mode:', mode, apiKey ? '(using user apiKey)' : '(using .env key)');
    const sysAgent = agent || new SysAgent({ apiKey });
    const normalized = normalizeMessages(messages);

    let content = '';

    try {
      for await (const chunk of sysAgent.stream(normalized, mode, { signal, apiKey })) {
        const delta = chunk?.choices?.[0]?.delta;
        if (!delta) continue;

        if (delta.tool_calls) {
          const tc = delta.tool_calls[0];
          yield {
            type: 'tool',
            text: formatToolCall(tc),
            name: tc.name,
            args: tc.args || {},
          };
        }
        if (delta.content && delta.content !== '') {
          content = delta.content;
        }
      }
    } catch (e) {
      console.error('[AgentService] streamEvents error:', e.message, e.stack);
      throw e;
    }

    console.log('[AgentService] streamEvents finished, content length:', content?.length);
    yield {
      type: 'content',
      text: content || 'No output.',
    };
  },
};
