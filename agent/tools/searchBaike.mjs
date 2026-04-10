import axios from "axios";
import { tool } from "@langchain/core/tools";
import z from "zod";
import * as cheerio from "cheerio";

/**
 * Search Baidu Baike
 * Fetches item page directly (Baidu Baike search is JS-rendered)
 */
const baikeSearchSchema = z.object({
  query: z.string().describe('The search query (MUST be in Chinese)'),
});

async function searchBaike({ query }) {
  try {
    // Direct Baidu Baike item URL
    const itemUrl = `https://baike.baidu.com/item/${encodeURIComponent(query)}`;
    
    const response = await axios.get(itemUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      timeout: 15000,
    });

    const $ = cheerio.load(response.data);
    
    // Extract title
    const title = $('meta[property="og:title"]').attr('content') || 
                  $('title').text().replace('_百度百科', '').replace(' - 百度百科', '').trim() || 
                  query;
    
    // Extract description
    const description = $('meta[property="og:description"]').attr('content') || 
                       $('meta[name="description"]').attr('content') || 
                       '';
    
    // Clean description
    const cleanDesc = description
      .replace(/<[^>]*>/g, '')
      .replace(/&[^;]+;/g, ' ')
      .trim()
      .slice(0, 300);
    
    return `Baidu Baike Results for "${query}":

[1] ${title}
${itemUrl}
${cleanDesc}`;

  } catch (error) {
    return `Baidu Baike search for "${query}" failed: ${error.message}`;
  }
}

export const searchBaikeTool = tool(
  searchBaike,
  {
    name: 'searchBaike',
    description: `Search Baidu Baike (Chinese encyclopedia).

IMPORTANT: 
- Input query MUST be in Chinese characters
- Output is in Chinese - always translate to user's language

Fetches Baidu Baike entry directly (search is JS-rendered).

Usage:
- Enter Chinese search term (e.g., "火星" not "Mars")
- Returns entry with title, URL, and description
- Always translate Chinese results to user's language

Returns (translate to user's language):
- Entry title and URL
- Description/abstract

Example output (translate to English):
[1] 火星
https://baike.baidu.com/item/火星
火星是太阳系中离地球最近的行星之一...

Input: Chinese query string`,
    schema: baikeSearchSchema,
  }
);
