# EVPAgent

A LangGraph-based AI agent with web search and fetch capabilities and Ink TUI.

## Architecture

```
src/
├── cli.js                 # CLI entry point
└── tui/
    └── App.jsx            # Ink TUI component

agent/
├── nodes/
│   ├── agent.mjs          # Main agent node (LLM + tools)
│   └── Openrouter/       # OpenRouter API adapter
├── tools/
│   ├── index.mjs          # Tool registry
│   ├── webSearchTool.mjs  # Bocha web search
│   └── webFetchTool.mjs   # Web page fetcher + markdown converter
├── state.mjs              # LangGraph state definition
└── graph.mjs              # Workflow graph definition
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

## Dependencies

- **@langchain/langgraph** — Agent workflow framework
- **[ink](https://github.com/vadimdemedes/ink)** — React for CLI (Vercel)
- **react** — UI component model for Ink
