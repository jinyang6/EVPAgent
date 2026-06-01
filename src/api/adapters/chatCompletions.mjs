/**
 * OpenAI Chat Completions Adapter
 *
 * Translates between OpenAI's /v1/chat/completions protocol and SysAgent.
 *
 *   OpenAI request  →  AgentService.streamEvents(messages, mode)
 *   Tool events      →  delta.reasoning (streamed in real time)
 *   Final content    →  delta.content   (emitted after agent finishes)
 */

import { AgentService } from '../../core/AgentService.mjs';

// ─── Helpers ───────────────────────────────────────────────────────────────────

let _idCounter = 0;

/**
 * Generate a unique completion ID (OpenAI style: "chatcmpl-<hex>").
 * @returns {string}
 */
function generateId() {
  _idCounter++;
  return `chatcmpl-${process.hrtime.bigint().toString(36)}-${_idCounter}`;
}

/**
 * Create an OpenAI-shaped chunk.
 */
function createChunk({ id, model, created, delta, finish_reason }) {
  const choice = { index: 0 };
  if (delta) choice.delta = delta;
  if (finish_reason) choice.finish_reason = finish_reason;
  return {
    id,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [choice],
  };
}

// ─── Streaming (SSE) ───────────────────────────────────────────────────────────

/**
 * Stream an OpenAI-compatible chat completion.
 *
 * Tool calls → delta.reasoning (real-time)
 * Final output.md → delta.content (last content chunk, after agent finishes)
 *
 * @param {Object} params
 * @param {string} params.model     - "probe" | "rover"
 * @param {Array}  params.messages  - OpenAI chat messages [{ role, content }]
 * @param {AbortSignal} [params.signal]
 * @returns {AsyncGenerator<Object>}
 */
export async function* streamChatCompletion({ model, messages, signal, apiKey }) {
  const mode = AgentService.resolveMode(model);
  const messages_ = AgentService.validateMessages(messages);

  const completionId = generateId();
  const created = Math.floor(Date.now() / 1000);

  // 1) Role announcement
  yield createChunk({
    id: completionId,
    model: mode,
    created,
    delta: { role: 'assistant', content: '' },
  });

  // 2) Stream agent execution — tools as reasoning, content at end
  for await (const event of AgentService.streamEvents(messages_, mode, { signal, apiKey })) {
    if (event.type === 'tool') {
      yield createChunk({
        id: completionId,
        model: mode,
        created,
        delta: {
          reasoning: event.text + '\n',
          tool_calls: [{
            index: 0,
            id: `call_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
            type: 'function',
            function: {
              name: event.name,
              arguments: JSON.stringify(event.args),
            },
          }],
        },
      });
    }
    if (event.type === 'content') {
      yield createChunk({
        id: completionId,
        model: mode,
        created,
        delta: { content: event.text },
      });
    }
  }

  // 3) Done
  yield createChunk({
    id: completionId,
    model: mode,
    created,
    delta: {},
    finish_reason: 'stop',
  });
}

// ─── Non-streaming (single response) ───────────────────────────────────────────

/**
 * Collect all chunks into a single chat completion response.
 *
 * @param {Object} params
 * @param {string} params.model
 * @param {Array}  params.messages
 * @param {AbortSignal} [params.signal]
 * @returns {Promise<Object>}
 */
export async function completeChatCompletion({ model, messages, signal, apiKey }) {
  const chunks = [];
  for await (const chunk of streamChatCompletion({ model, messages, signal, apiKey })) {
    chunks.push(chunk);
  }

  const mode = AgentService.resolveMode(model);
  const first = chunks[0] || {};

  // Content is the last delta.content chunk
  const contentChunk = chunks.findLast(
    c => c?.choices?.[0]?.delta?.content && c.choices[0].delta.content !== '',
  );
  const content = contentChunk?.choices?.[0]?.delta?.content || '';

  return {
    id: first.id || generateId(),
    object: 'chat.completion',
    created: first.created || Math.floor(Date.now() / 1000),
    model: mode,
    choices: [{
      index: 0,
      message: { role: 'assistant', content },
      finish_reason: 'stop',
    }],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  };
}
