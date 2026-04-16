# EVPAgent

A LangGraph-based AI agent with web search and fetch capabilities and Ink TUI.

## Architecture

```
src/
├── cli.jsx                # CLI entry point
└── tui/
    └── App.jsx            # Ink TUI component

system/agents/
├── SysAgent/              # Main pipeline orchestrator
│   ├── index.mjs          # SysAgent class (stream/invoke)
│   ├── utils/
│   │   ├── paths.mjs      # getPromptsDir(), getConfigDir()
│   │   └── files.mjs      # readJson(), readFile()
│   └── types/
│       └── chunk.mjs      # OpenAI-compatible chunk types
├── PromptComposerAgent/   # Creates dynamic_system_prompt.md
├── SearchAgent/           # Web search pipeline
│   └── tools/
│       ├── web/           # webSearchTool, webFetchTool
│       ├── wikipedia/     # searchWikipedia, fetchWikiPage
│       └── vector/       # Vector storage helpers
└── PromptRefineAgent/     # Updates prompts based on session

Pipeline Flow:
  compose (PromptComposerAgent)
    → search (SearchAgent)
    → refine (PromptRefineAgent)
```

## Installation

```bash
npm install
```

## Usage

```bash
npm start
```

Or link for global access:

```bash
npm link
evp
```

## SysAgent API

```javascript
import { createSysAgent } from './system/agents/SysAgent/index.mjs';

const agent = createSysAgent({ baseURL, apiKey, modelId });

// Streaming (yields OpenAI-compatible chunks)
for await (const chunk of agent.stream("query")) {
  // { choices: [{ delta: { content: "..." } }] }
  // { choices: [{ delta: { tool_calls: [{ name: "webSearchTool", args: {} }] }] }
}

// Invoke (returns array of all chunks)
const chunks = await agent.invoke("query");
```

## Dependencies

- **@langchain/langgraph** — Agent workflow framework
- **[ink](https://github.com/vadimdemedes/ink)** — React for CLI (Vercel)
- **react** — UI component model for Ink
