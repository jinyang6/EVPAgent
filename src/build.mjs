import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read system prompt at build time to embed it
const systemPromptPath = join(__dirname, '../agent/config/system_prompt.md');
const systemPromptContent = readFileSync(systemPromptPath, 'utf-8');

await esbuild.build({
  entryPoints: [join(__dirname, 'cli.jsx')],
  bundle: true,
  outfile: join(__dirname, 'dist', 'cli.js'),
  format: 'esm',
  platform: 'node',
  target: 'node20',
  loader: {
    '.jsx': 'jsx',
  },
  define: {
    '__SYSTEM_PROMPT__': JSON.stringify(systemPromptContent),
  },
  external: [
    'ink', 
    'react',
    'axios',
    'form-data',
    'combined-stream',
    'delayed-stream',
    'mime-types',
    'mime-db',
    'web-streams-ponyfill',
    '@langchain/core',
    '@langchain/langgraph',
    '@langchain/openai',
    '@langchain/community',
    'langchain',
    'cheerio',
    'turndown',
    'zod',
    'duck-duck-scrape',
    'dotenv',
    '@lancedb/lancedb',
    'node:path',
    'node:process',
    'node:events',
    'node:buffer',
    'node:util',
    'node:stream',
    'node:querystring',
    'node:url',
    'node:http',
    'node:https',
    'node:zlib',
    'node:fs',
    'node:os',
    'node:crypto',
  ],
  minify: false,
  sourcemap: true,
});

console.log('Build complete: dist/cli.js');
