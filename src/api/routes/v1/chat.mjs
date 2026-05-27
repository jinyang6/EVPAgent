/**
 * POST /v1/chat/completions
 *
 * OpenAI-compatible chat completions endpoint.
 * Accepts { model, messages, stream, ... } and delegates to the adapter.
 *
 * Model mapping:
 *   "probe" → probe mode (fast, direct Wikipedia search)
 *   "rover" → rover mode (compose → search → refine pipeline)
 *   unknown → defaults to "probe"
 */

import { Router } from 'express';
import {
  streamChatCompletion,
  completeChatCompletion,
} from '../../adapters/chatCompletions.mjs';

const router = Router();

router.post('/', async (req, res, next) => {
  try {
    const { model, messages, stream } = req.body;

    if (stream) {
      // ── Streaming (SSE) ──────────────────────────────────────────────────
      const controller = new AbortController();
      const onAbort = () => controller.abort();
      req.on('aborted', onAbort);

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      try {
        for await (const chunk of streamChatCompletion({
          model, messages,
          signal: controller.signal,
        })) {
          if (controller.signal.aborted) break;
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
        if (!controller.signal.aborted) {
          res.write('data: [DONE]\n\n');
        }
      } catch (streamErr) {
        if (controller.signal.aborted) {
          res.end();
          return;
        }
        res.write(`data: ${JSON.stringify({
          error: { message: streamErr.message, type: 'server_error', code: null },
        })}\n\n`);
      } finally {
        req.removeListener('aborted', onAbort);
        res.end();
      }
    } else {
      // ── Non-streaming ─────────────────────────────────────────────────────
      console.log('[chat] non-streaming request started:', { model, msgCount: messages?.length });
      try {
        const completion = await completeChatCompletion({
          model, messages,
          signal: undefined,
        });
        console.log('[chat] non-streaming request completed');
        res.json(completion);
      } catch (innerErr) {
        console.error('[chat] completeChatCompletion failed:', innerErr.message, innerErr.stack);
        throw innerErr;
      }
    }
  } catch (err) {
    next(err);
  }
});

export default router;
