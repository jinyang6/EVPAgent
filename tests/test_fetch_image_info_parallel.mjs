import { fetchWikiImageInfo } from '../system/agents/MainAgent/tools/wikipedia/wikipediaHelpers.mjs';

const TITLE = 'BBH gravitational lensing of gw150914.webm';
const COUNT = 10;

console.log(`Testing ${COUNT} parallel fetchWikiImageInfo calls for:\n  ${TITLE}\n`);

// Warm-up: single call to prime DNS/connection
const warm = await fetchWikiImageInfo(TITLE);
console.log(`Warm-up: ${warm ? '✅ found' : '❌ not found'}\n`);

// Sequential baseline
const seqStart = performance.now();
for (let i = 0; i < COUNT; i++) {
  await fetchWikiImageInfo(TITLE);
}
const seqElapsed = (performance.now() - seqStart).toFixed(0);
console.log(`Sequential: ${seqElapsed} ms (${COUNT} requests one at a time)\n`);

// Parallel
const parStart = performance.now();
const results = await Promise.all(
  Array.from({ length: COUNT }, () => fetchWikiImageInfo(TITLE))
);
const parElapsed = (performance.now() - parStart).toFixed(0);

let ok = 0;
results.forEach((r, i) => {
  if (r?.url) ok++;
  else console.log(`  [${i + 1}] ❌`);
});
console.log(`Parallel  : ${parElapsed} ms (${ok}/${COUNT} found)\n`);

const speedup = (seqElapsed / parElapsed).toFixed(1);
console.log(`Speedup   : ${speedup}x`);
