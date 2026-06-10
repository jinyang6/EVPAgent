# EVPAgent

A desktop AI research agent that produces verified, source-grounded articles with embedded media — powered by Wikipedia and your own API key.

<p align="center">
  <img src="assets/screenshots/hero.png" alt="EVPAgent" style="border-radius: 8px;" />
</p>

## Features

- **Verified Answers** — Every claim linked to a Wikipedia source. Never hallucinates facts, dates, or names.
- **Two Research Modes** — Probe for fast, conversational lookups. Rover for in-depth, multi-hour investigations with sub-agent delegation.
- **Rich Multimedia Output** — Automatically discovers and embeds images, audio, and video from Wikipedia Commons into every article.
- **Ask Once, Get a Report** — Output is a structured article with ordered sections, inline citations, and media figures — not a chat log.
- **Self-Improving** — Learns from each session to optimize future searches. Prompt strategy gets better with use.
- **OpenAI-Compatible API** — Built-in API server. Point any OpenAI-compatible client (including ChatAnyLLM) at `localhost:<port>/v1`.
- **Local & Private** — All research stays on your machine. Your OpenRouter API key, nothing else needed.

## Installation

### Download
Download the latest installer from [Releases](../../releases):
- **Windows**: `EVPAgent-Setup.exe`

### Install
1. Run the installer
2. Choose installation directory
3. Launch EVPAgent

## Quick Start

1. **Add API Key** — Settings → API Key → Enter your OpenRouter API key
2. **New Conversation** — Click + button in sidebar
3. **Ask a Question** — Type any research topic and press Enter
4. **Get Your Report** — EVPAgent searches Wikipedia, cross-references articles, discovers media, and delivers a formatted, citation-backed article

## Keyboard Shortcuts

- `Enter` — Send message
- `Shift+Enter` — New line
- `Ctrl+B` — Toggle sidebar

## Development

```bash
git clone https://github.com/jinyang6/EVPAgent.git
cd EVPAgent
npm install
```

### Run Modes

Choose the mode that fits what you're working on:

| Command | When to use |
|---|---|
| `npm start` | Running the full desktop app (Electron + UI + API) |
| `npm run serve` | Testing the API server directly (curl, Postman, other clients) |
| `npm run cli` | Full CLI version of the system, same agent pipeline |

### Production Build

```bash
npm run electron:build   # outputs installer to dist-electron/
```

## Technology Stack

Electron • React • Vite • Tailwind CSS • LangGraph • LanceDB

## License

Apache License 2.0 — See [LICENSE](LICENSE) file for details

## Support

Found a bug or have a suggestion? [Open an issue](../../issues)
