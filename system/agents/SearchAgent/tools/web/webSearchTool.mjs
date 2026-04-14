import axios from "axios";
import { tool } from "@langchain/core/tools";
import z from "zod";

async function webSearch({query, count = 10}) {

    const url = 'https://api.bocha.cn/v1/web-search';
    const bochaKey = process.env.BOCHA_API_KEY;

    const payload = {
            query: query,
            freshness: "noLimit",
            summary: false,
            count: count
    };

    try {
        const response = await axios.post(
            url,
            payload,
            {
                headers: {
                    'Authorization': `Bearer ${bochaKey}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (response.status === 200 && response.data.data) {
            const webpages = response.data.data.webPages?.value || [];
            if (webpages.length === 0) {
                return "Web search returns with no results.";
            } else {
                // Use markdown, best for the llm to read
                return webpages.map((page, idx) => `
                    ### Result [${idx + 1}]: ${page.name}
                    - **Source:** ${page.siteName || "Web"}
                    - **URL:** ${page.url}
                    - **Snippet:** ${page.snippet || "No preview available."}
                    `).join('\n---\n');
            }
        } else {
            return `Web search tool failed with status code ${response.status}`
        }


    } catch (error) {
        return `Web search tool error: ${error.message}`;
    }
}


export const webSearchTool = tool(
    webSearch,
    {
        name: "web_search",
        description: `Performs a web search.
                    Takes a search query string and an optional count parameter (default 10) for the number of results.
                    Returns a markdown-formatted list of search results,
                    each containing the result title, source site, URL, and content summary.`,
        schema: z.object(
            {
                query: z.string().describe(
                    "The web search query string"
                ),
                count: z.number().optional().default(10).describe(
                    "Number of results to return"
                )
            }
        ),
    }
);