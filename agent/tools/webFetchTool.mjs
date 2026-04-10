import axios from "axios";
import { tool } from "@langchain/core/tools";
import z from "zod";
import * as cheerio from "cheerio";
import TurndownService from "turndown";

const turnmarkdownService = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced'
});

// Remove citation numbers [1], [2] etc. to save tokens
turnmarkdownService.addRule('removeCitations', {
  filter: (node) => {
    return node.nodeName === 'SUP' && node.classList.contains('reference');
  },
  replacement: () => ''
});

async function fetchUrl({ url }) {
  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent": "EVPAgent/1.0 (https://github.com/jinyang6/EVPAgent; jiatom519@gmail.com) axios/1.x",
      },
      timeout: 15000,
    });

    const $ = cheerio.load(response.data);
    
    // Extract title
    const title = $('#firstHeading').text().trim() || 
                  $('title').text().trim().replace(' - Wikipedia', '') || 
                  'No Title';
    
    // For Wikipedia: extract main content only
    const isWikipedia = url.includes('wikipedia.org');
    
    let content;
    if (isWikipedia) {
      // Remove infobox, navboxes, tables of contents
      $('.infobox', '.navbox', '.toc', '.metadata', '.printfooter').remove();
      
      // Get main content
      content = $('#mw-content-text').html() || $('body').html();
    } else {
      // Generic: remove junk
      $('script, style, nav, footer, header, aside, noscript, .sidebar, .advertisement').remove();
      content = $('main').html() || $('article').html() || $('body').html();
    }
    
    // Convert to markdown
    let markdown = turnmarkdownService.turndown(content);
    
    // Clean up excessive whitespace and newlines
    markdown = markdown
      .replace(/\n{4,}/g, '\n\n\n')
      .replace(/\[(\d+)\]/g, '[$1]')  // Keep citation refs but format
      .replace(/\*\*See also\*\*[\s\S]*?$/i, '')  // Remove "See also" section
      .replace(/\*\*References\*\*[\s\S]*?$/i, '')  // Remove references section
      .trim();

    // Limit to ~8000 chars for token efficiency
    const maxChars = 8000;
    if (markdown.length > maxChars) {
      markdown = markdown.slice(0, maxChars) + '\n\n[... content truncated ...]';
    }

    return `# ${title}\n**Source:** ${url}\n\n${markdown}`;

  } catch (error) {
    return `Error fetching URL ${url}: ${error.message}`;
  }
}

export const fetchUrlTool = tool(
  fetchUrl,
  {
    name: "fetch_url",
    description: `Fetches a URL and converts it to clean Markdown.

When to use:
- After a search returns a relevant URL you want to read in full
- To extract specific details not in the search snippet
- To get complete information from a specific webpage

Usage tips:
- Use a search tool first to find the right URL
- One fetch per important source, not multiple
- Check the title to confirm it's the right page
- Extract only the sections you need from the content

Returns:
- Page title as header (# Title)
- Main content in clean Markdown
- Content is truncated to ~8000 chars if too long

Input: URL to fetch`,
    schema: z.object({
      url: z.string().describe("The URL to fetch content from")
    })
  }
);
