#!/usr/bin/env node

/**
 * EVPAgent API Server
 *
 * OpenAI-compatible HTTP API exposing the Wikipedia research agent.
 *
 * Endpoints:
 *   POST /v1/chat/completions  — Chat completion (streaming + non-streaming)
 *   GET  /v1/models             — List available models
 *   GET  /v1/models/:model_id   — Retrieve a single model
 *   GET  /health                — Health check (no auth required)
 *
 * Usage:
 *   node src/api/index.mjs
 *   PORT=8080 node src/api/index.mjs
 *
 * Can also be started from the CLI via /serve [port].
 */

import express from 'express';
import { SysAgent } from '../../system/agents/SysAgent/index.mjs';
import { AgentService } from '../core/AgentService.mjs';
import { authMiddleware } from './middleware/auth.mjs';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.mjs';
import chatRouter from './routes/v1/chat.mjs';
import modelsRouter from './routes/v1/models.mjs';
import { getConfig } from '../config.mjs';

// ─── Configuration ─────────────────────────────────────────────────────────────

const DEFAULT_PORT = parseInt(process.env.API_PORT || process.env.PORT || '3456', 10);

let _server = null;
let _app = null;

// ─── Public API ─────────────────────────────────────────────────────────────────

/**
 * Start the API server.
 * @param {number} [port] — Override port (defaults to API_PORT env or 3456)
 * @returns {Promise<import('http').Server>}
 */
export async function start(port) {
  if (_server) {
    console.log(`Server already running on port ${_server.address().port}`);
    return _server;
  }

  // Init services
  const bootAgent = new SysAgent();
  await bootAgent.init();
  await AgentService.init();
  console.log('Services initialized.');

  // Build Express app
  _app = express();
  _app.use(express.json({ limit: '1mb' }));

  // --- Public routes ---
  _app.get('/health', (_req, res) => {
    res.json({ status: 'ok', version: process.env.npm_package_version || '1.0.0' });
  });

  // --- Protected routes ---
  _app.use('/v1', authMiddleware);

  // Key validation — proxy Bearer token to the configured provider for verification
  _app.get('/v1/key', async (req, res) => {
    try {
      const { searchModel: { baseUrl } } = getConfig();
      const response = await fetch(`${baseUrl}/key`, {
        headers: {
          'Authorization': `Bearer ${req.apiKey}`,
          'HTTP-Referer': 'https://github.com/jinyang6/EVPAgent',
          'X-Title': 'EVPAgent',
        },
        signal: AbortSignal.timeout(10000),
      });
      const data = await response.json().catch(() => ({}));
      res.status(response.status).json(data);
    } catch (err) {
      res.status(502).json({
        error: { message: `Key check failed: ${err.message}`, type: 'server_error' },
      });
    }
  });

  _app.use('/v1/chat/completions', chatRouter);
  _app.use('/v1/models', modelsRouter);

  // --- Error handling ---
  _app.use(notFoundHandler);
  _app.use(errorHandler);

  // Start listening
  const p = port ?? DEFAULT_PORT;
  return new Promise(resolve => {
    _server = _app.listen(p, () => {
      const actualPort = _server.address().port;
      console.log(`EVPAgent API listening on http://localhost:${actualPort}`);
      console.log(`  POST /v1/chat/completions`);
      console.log(`  GET  /v1/models`);
      console.log(`  GET  /v1/models/:model_id`);
      console.log(`  GET  /health`);
      resolve(_server);
    });
  });
}

/**
 * Stop the API server.
 */
export function stop() {
  if (_server) {
    _server.close();
    _server = null;
    _app = null;
    console.log('API server stopped.');
  }
}

// ─── Standalone entry ──────────────────────────────────────────────────────────

const isMain = process.argv[1] && (
  process.argv[1].endsWith('index.mjs') ||
  process.argv[1].endsWith('api\\index.mjs') ||
  process.argv[1].endsWith('api/index.mjs')
);
if (isMain) {
  try {
    await start();
    // Keep the process alive (prevent event-loop drain)
    process.stdin.resume();
    process.on('SIGINT', () => { stop(); process.exit(0); });
    process.on('SIGTERM', () => { stop(); process.exit(0); });
  } catch (err) {
    console.error('Failed to start API server:', err);
    process.exit(1);
  }
}
