#!/usr/bin/env node

/**
 * EVPAgent CLI Entry Point
 * 
 * Usage: 
 *   npm start                    - Run directly
 *   npm link && evp              - Install globally and run
 */

import 'dotenv/config';
import React from 'react';
import { render } from 'ink';
import App from './tui/App.jsx';
import { workflow } from '../agent/graph/graph.mjs';

// Agent configuration
const config = {
  configurable: {
    model: process.env.OPENROUTER_MODEL || 'stepfun/step-3.5-flash:free',
    key: process.env.OPENROUTER_API_KEY,
  },
  recursionLimit: 100,
};

// Unwrap the workflow for Ink compatibility
const agent = {
  stream: async (state, cfg) => {
    return await workflow.stream(state, cfg || config);
  }
};

// Render the TUI
render(React.createElement(App, { agent, config }), {
  exitOnCtrlC: true,
});
