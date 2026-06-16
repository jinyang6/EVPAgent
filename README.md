# EVPAgent

Give the agent a question. The LLM investigates, you read the result. It searches Wikipedia, follows evidence chains across articles, and forms each new question from the last answer, iterating until scattered sources converge into one coherent article.

**[Download](https://github.com/jinyang6/EVPAgent/releases/latest)**

<p align="center">
  <img src="assets/screenshots/hero.png" alt="EVPAgent" style="border-radius: 8px;" />
</p>

## Features

- **Adaptive question formulation** — Rephrases queries for academic precision, searches Wikipedia, and for complex questions, adaptively formulates sub-questions one at a time — each shaped by the prior answer — until the evidence converges.
- **Verifiable attribution** — Every claim carries an inline markdown URL link to its Wikipedia source. No hallucination.
- **Multimedia augmentation** — Discovers and embeds images, audio, and video from Wikimedia Commons into the article output.
- **Long-form synthesis** — Delivers a sectioned article with media figures, not a chat log.
- **Local execution** — Runs on your machine. OpenRouter API key is all you need.

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
4. **Get Results** — EVPAgent searches Wikipedia, cross-references articles, discovers media, and delivers a formatted article with markdown URL text

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
