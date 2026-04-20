import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, cpSync, mkdirSync, existsSync, readdirSync, writeFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');
const VERSION = pkg.version;

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = join(__dirname);
const distDir = join(srcDir, 'dist');
const systemPromptsDir = join(__dirname, '../system/prompts');
const distPromptsDir = join(distDir, 'prompts');
const distConfigDir = join(distPromptsDir, 'config');

// Ensure dist directories exist
if (!existsSync(distConfigDir)) {
  mkdirSync(distConfigDir, { recursive: true });
}
if (!existsSync(distPromptsDir)) {
  mkdirSync(distPromptsDir, { recursive: true });
}

// Write version file
writeFileSync(join(distDir, 'version.json'), JSON.stringify({ version: VERSION }), 'utf-8');
console.log(`Version: ${VERSION}`);

// Copy config files to dist/prompts/config/
const configFiles = [
  'system_prompt.md',
  'Rephrase.md',
  'Loop.md',
];

for (const file of configFiles) {
  const src = join(systemPromptsDir, 'config', file);
  const dest = join(distConfigDir, file);
  if (existsSync(src)) {
    cpSync(src, dest);
    console.log(`Copied: ${file}`);
  }
}

// Copy prompts directory structure to dist/prompts/
function copyPromptFolder(srcFolder, destFolder) {
  if (!existsSync(srcFolder)) return;
  if (!existsSync(destFolder)) {
    mkdirSync(destFolder, { recursive: true });
  }
  const files = readdirSync(srcFolder);
  for (const file of files) {
    const srcFile = join(srcFolder, file);
    const destFile = join(destFolder, file);
    if (existsSync(srcFile)) {
      cpSync(srcFile, destFile);
      console.log(`Copied prompt: ${file}`);
    }
  }
}

// Copy Rephrase and Loop folders
const loopSrc = join(systemPromptsDir, 'dynamic_prompts', 'Loop');
const loopDest = join(distPromptsDir, 'dynamic_prompts', 'Loop');
copyPromptFolder(loopSrc, loopDest);

const rephraseSrc = join(systemPromptsDir, 'dynamic_prompts', 'Rephrase');
const rephraseDest = join(distPromptsDir, 'dynamic_prompts', 'Rephrase');
copyPromptFolder(rephraseSrc, rephraseDest);

console.log('Config and prompt files copied');
console.log('Build complete: dist/cli.js');

await esbuild.build({
  entryPoints: [join(srcDir, 'cli.js')],
  bundle: true,
  outfile: join(distDir, 'cli.js'),
  format: 'esm',
  platform: 'node',
  target: 'node20',
  external: [
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
    'node:readline',
  ],
  minify: false,
  sourcemap: true,
});