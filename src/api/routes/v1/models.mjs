/**
 * GET /v1/models
 * GET /v1/models/:model_id
 *
 * OpenAI-compatible model listing endpoints.
 * Delegates to AgentService for the model registry.
 */

import { Router } from 'express';
import { AgentService } from '../../../core/AgentService.mjs';

const router = Router();

/**
 * GET /v1/models
 * Returns the list of available models.
 */
router.get('/', (_req, res) => {
  res.json(AgentService.listModels());
});

/**
 * GET /v1/models/:model_id
 * Returns a single model by ID, or 404 if not found.
 */
router.get('/:model_id', (req, res) => {
  const { model_id } = req.params;
  const model = AgentService.getModel(model_id);

  if (!model) {
    return res.status(404).json({
      error: {
        message: `Model '${model_id}' not found. Available models: probe, rover`,
        type: 'invalid_request_error',
        code: 'model_not_found',
        param: 'model_id',
      },
    });
  }

  res.json(model);
});

export default router;
