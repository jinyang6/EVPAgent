import { tool } from "@langchain/core/tools";
import z from "zod";

async function webSearch({query, count = 10, include, exclude}) {

    const url = 'https://api.exa.ai/search';
    const exaKey = process.env.EXA_API_KEY;

    // Build include/exclude arrays from comma-separated strings
    // Default exclude: wikipedia.org (since there's a separate Wikipedia tool)
    const includeDomains = include ? include.split(',').map(d => d.trim()) : [];
    const excludeDomains = exclude ? exclude.split(',').map(d => d.trim()) : ['en.wikipedia.org', 'wikipedia.org'];

    const payload = {
        query: query,
        numResults: Math.min(Math.max(count, 1), 100),
        type: "auto"
    };

    // Add optional domain filters
    if (includeDomains.length > 0) payload.includeDomains = includeDomains;
    if (excludeDomains.length > 0) payload.excludeDomains = excludeDomains;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'x-api-key': exaKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const data = await response.json();
            const results = data?.results || [];
            if (results.length === 0) {
                return "Web search returned no results.";
            } else {
                // Format results like Wikipedia search
                let output = `Web Search Results for "${query}":\n\n`;
                results.forEach((result, index) => {
                    output += `[${index + 1}] ${result.title || "Untitled"}\n`;
                    output += `${result.url}\n`;
                    output += `${result.publishedDate ? `Published: ${result.publishedDate} | ` : ""}Source: ${result.author || new URL(result.url).hostname || "Web"}\n\n`;
                });
                return output.trim();
            }
        } else {
            return `Web search failed with status code ${response.status}`;
        }

    } catch (error) {
        return `Web search error: ${error.message}`;
    }
}


export const webSearchTool = tool(
    webSearch,
    {
        name: "web_search",
        description: `Performs a web search using Exa AI API.

Parameters:
- query (required): The web search query string
- count (optional, default=10, range 1-100): Number of results to return
- include (optional): Restrict search to specific domains (e.g., "bbc.com,cnn.com"), Multiple domains separated by commas.
- exclude (optional): Exclude specific domains from search (e.g., "wikipedia.org,bbc.com"), Multiple domains separated by commas.
Returns: Page titles, URLs, and sources.

Note: For full content of any result, call web_fetch with the URL.`,
        schema: z.object(
            {
                query: z.string().describe("The web search query string"),
                count: z.number().optional().default(10).describe("Number of results to return (1-100)"),
                include: z.string().optional().describe("Restrict search to specific domains (e.g., 'bbc.com,cnn.com')"),
                exclude: z.string().optional().describe("Exclude specific domains from search")
            }
        ),
    }
);