import axios from "axios";
import { tool } from "@langchain/core/tools";
import z from "zod";
import { readFileSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import { getUserPromptsDir } from "../../../utils/appDataPaths.mjs";

/**
 * Report search result to session_manifest.json
 */
function reportSearchResult(query, results) {
  try {
    const promptsDir = getUserPromptsDir();
    const manifestPath = join(promptsDir, 'session_manifest.json');

    let manifest = { searchHistory: [], searchSuccess: false };
    if (existsSync(manifestPath)) {
      try {
        const content = readFileSync(manifestPath, 'utf-8').trim();
        if (content) {
          manifest = JSON.parse(content);
        }
      } catch {
        // File exists but invalid JSON - start fresh
      }
    }

    if (!manifest.searchHistory) manifest.searchHistory = [];

    manifest.searchHistory.push({
      tool: 'searchWikipedia',
      arguments: { query, limit: 5 },
      result: results.slice(0, 1000),
      timestamp: new Date().toISOString()
    });

    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  } catch (error) {
    console.error("[searchWikipedia] reportSearchResult() failed:", error.message);
  }
}

/**
 * Search Wikipedia using MediaWiki Action API
 * https://www.mediawiki.org/wiki/API:Search
 */
const wikipediaSearchSchema = z.object({
  query: z.string().describe('The search query to find relevant Wikipedia articles'),
  limit: z.number().optional().default(5).describe('Number of results: 3 for simple facts, 5 for default, 10+ for comprehensive research'),
  type: z.enum(['text', 'nearmatch']).optional().default('text')
    .describe('Type of search: text (full text) or nearmatch'),
});

async function wikipediaSearch({ query, limit = 5, type = 'text' }) {
  // ==========================================================================
  // Fetch from Wikipedia API
  // ==========================================================================
  const params = new URLSearchParams({
    action: 'query',
    list: 'search',
    srsearch: query,
    srnamespace: '0',
    srlimit: String(limit),
    srwhat: type,
    srprop: 'size|wordcount|timestamp|snippet|titlesnippet',
    format: 'json',
    utf8: '1',
  });

  const url = `http://en.wikipedia.org/w/api.php?${params.toString()}`;

  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent": "EVPAgent/1.0 (https://github.com/jinyang6/EVPAgent; jiatom519@gmail.com)",
      },
      timeout: 15000,
    });

    const queryData = response.data?.query;

    if (!queryData?.search || queryData.search.length === 0) {
      return `Wikipedia search for "${query}" returned no results.`;
    }

    const searchInfo = queryData.searchinfo || {};
    const totalHits = searchInfo.totalhits || queryData.search.length;

    let output = `Wikipedia Search Results for "${query}":\n\n`;

    queryData.search.forEach((item, index) => {
      const articleUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))}`;
      const snippet = item.snippet?.replace(/<[^>]*>/g, '') || 'No preview available';

      output += `[${index + 1}] ${item.title}\n`;
      output += `${articleUrl}\n`;
      output += `${snippet}\n\n`;
    });

    // Report result before returning
    reportSearchResult(query, output);

    return output.trim();

  } catch (error) {
    if (error.response?.status === 429) {
      return `Wikipedia search rate limited. Please wait and try again.`;
    }
    return `Wikipedia search for "${query}" failed: ${error.message}`;
  }
}

export const searchWikipediaTool = tool(
  wikipediaSearch,
  {
    name: 'searchWikipedia',
    description: `Search Wikipedia for articles using MediaWiki Action API.

Parameters:
- query (required): Search query - supports advanced operators:
  - "exact phrase" for exact match
  - AND / OR / NOT for boolean logic (e.g., "Mars AND ocean NOT atmosphere")
  - intitle: for title-only search (e.g., intitle:"Curiosity rover")
  - insource: for article text search (e.g., insource:"olivine" "water")
  - incategory: for category search (e.g., incategory:"Space exploration")
- limit (optional, default=5): Number of results (3=facts, 5=default, 10+=research)
- type (optional): 'text' or 'nearmatch'

Returns: Page titles, URLs, snippets.`,
    schema: wikipediaSearchSchema,
  }
);