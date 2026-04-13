import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, cpSync, mkdirSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = join(__dirname);
const distDir = join(srcDir, 'dist');
const configDir = join(__dirname, '../agent/config');
const distConfigDir = join(distDir, 'config');

// Ensure dist/config exists
if (!existsSync(distConfigDir)) {
  mkdirSync(distConfigDir, { recursive: true });
}

// Copy config files to dist/
const configFiles = [
  'system_prompt.md',
  'Rephrase.md',
  'Loop.md',
];

for (const file of configFiles) {
  const src = join(configDir, file);
  const dest = join(distConfigDir, file);
  if (existsSync(src)) {
    cpSync(src, dest);
    console.log(`Copied: ${file}`);
  }
}

console.log('Config files copied to dist/config/');
console.log('Build complete: dist/cli.js');

await esbuild.build({
  entryPoints: [join(srcDir, 'cli.jsx')],
  bundle: true,
  outfile: join(distDir, 'cli.js'),
  format: 'esm',
  platform: 'node',
  target: 'node20',
  loader: {
    '.jsx': 'jsx',
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