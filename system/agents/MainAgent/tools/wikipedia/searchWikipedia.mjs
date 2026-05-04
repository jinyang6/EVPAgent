import { tool } from "@langchain/core/tools";
import z from "zod";
import { wikiRequest, reportWikiResult, WIKI_USER_AGENT } from "./wikipediaHelpers.mjs";

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
  try {
    const data = await wikiRequest("query", {
      list: "search",
      srsearch: query,
      srnamespace: "0",
      srlimit: String(limit),
      srwhat: type,
      srprop: "size|wordcount|timestamp|snippet|titlesnippet",
      utf8: "1",
    });

    const queryData = data?.query;

    if (!queryData?.search || queryData.search.length === 0) {
      return `Wikipedia search for "${query}" returned no results.`;
    }

    let output = `Wikipedia Search Results for "${query}":\n\n`;

    queryData.search.forEach((item, index) => {
      const articleUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))}`;
      const snippet = item.snippet?.replace(/<[^>]*>/g, '') || 'No preview available';

      output += `[${index + 1}] ${item.title}\n`;
      output += `${articleUrl}\n`;
      output += `${snippet}\n\n`;
    });

    reportWikiResult('searchWikipedia', { query, limit }, output);
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
    description: `Search Wikipedia for relevant articles by query.

When to use:
- Use when you need to FIND which Wikipedia article to read
- Use BEFORE fetchWikiPage to locate the right page
- Use for: fact-checking, finding articles, locating sources

Parameters:
- query (required): Search query. Supports operators:
  - "exact phrase" for exact match
  - AND / OR / NOT for boolean logic (e.g., "Mars AND ocean NOT atmosphere")
  - intitle: for title-only search (e.g., intitle:"Curiosity rover")
  - insource: for article text search (e.g., insource:"olivine" "water")
  - incategory: for category search (e.g., incategory:"Space exploration")
- limit (optional, default=5): Number of results (3=facts, 5=default, 10+=research)
- type (optional): 'text' or 'nearmatch'

Returns: Numbered list of matching articles with titles, URLs, and snippets.`,
    schema: wikipediaSearchSchema,
  }
);