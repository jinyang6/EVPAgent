import axios from "axios";
import { tool } from "@langchain/core/tools";
import z from "zod";
import * as cheerio from "cheerio";
import TurndownService from "turndown";
import { readFileSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import {
  searchVectorDB,
  upsertWikiPage,
} from "../vector/vectorHelpers.mjs";
import {
  recordVectorHit,
  recordWebRequest,
  recordArticle,
} from "../stats.mjs";

/**
 * Get platform-aware prompts directory
 */
function getPromptsDir() {
  const homeDir = process.env.APPDATA || join(process.env.HOME || "", ".evpagent");
  if (process.platform === 'win32') {
    return join(process.env.APPDATA, "EVPAgent", "prompts", "dynamic_prompts");
  } else if (process.platform === 'darwin') {
    return join(homeDir, "Library", "Application Support", "EVPAgent", "prompts", "dynamic_prompts");
  } else {
    return join(homeDir, ".config", "evpagent", "prompts", "dynamic_prompts");
  }
}

/**
 * Report fetch result to session_manifest.json
 */
function reportFetchResult(page, section, content) {
  try {
    const promptsDir = getPromptsDir();
    const manifestPath = join(promptsDir, 'session_manifest.json');
    
    let manifest = { searchHistory: [], searchSuccess: false };
    if (existsSync(manifestPath)) {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    }
    
    if (!manifest.searchHistory) manifest.searchHistory = [];
    
    manifest.searchHistory.push({
      tool: 'fetchWikiPage',
      arguments: { page, section: section || null },
      result: content.slice(0, 1000), // Truncate for storage
      timestamp: new Date().toISOString()
    });
    
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  } catch (error) {
    console.error("[fetchWikiPage] reportFetchResult() failed:", error.message);
  }
}

/**
 * Schema for fetchWikiPage tool
 */
const wikiPageSchema = z.object({
  page: z.string().describe('Wikipedia page title (e.g., "Mars")'),
  section: z.string().optional().describe('Section anchor to fetch (e.g., "Formation", omit for overview)'),
  limit: z.number().optional().default(3).describe('Number of results from vector cache (top-k)'),
  // useCache: z.boolean().optional().default(true).describe('Whether to use vector cache for retrieval'),
});

/**
 * Decode HTML entities in a string
 * @param {string} str - String with potential HTML entities
 * @returns {string} Decoded string
 */
function decodeHtmlEntities(str) {
  return str
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([a-fA-F0-9]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Process Wikipedia HTML into readable Markdown with inline citations and full URLs
 * @param {string} html - Raw HTML from Wikipedia API
 * @param {string} pageTitle - Title of the Wikipedia page for resolving relative links
 * @returns {string} Processed Markdown
 */
function htmlToMarkdown(html) {
  const $ = cheerio.load(html);

  // Setup turndown
  const turndown = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
  });

  // Build citation lookup map (O(1) instead of O(n) find)
  const citations = new Map();
  let idx = 1;
  $("ol.references li").each((_, el) => {
    const $el = $(el);
    const text = $el.text().trim().replace(/^\[\d+\]\s*/, "");
    if (text.includes("Cite error")) return;
    const id = $el.attr("id") || "";
    const url = $el.find("a.external").attr("href") || "";
    citations.set(id, { index: idx++, text: text.slice(0, 150), url });
  });

  // Replace citation superscripts with inline links
  $("sup.reference, sup.citation").each((_, el) => {
    const $el = $(el);
    const href = decodeHtmlEntities($el.find("a").attr("href") || "");
    const match = href.match(/#(cite_note-[^"]+)/);
    const citeId = match && [...citations.keys()].find(k => k.includes(match[1]));
    const citation = citeId && citations.get(citeId);
    if (citation) {
      $el.replaceWith(citation.url ? `[${citation.index}](${citation.url})` : `[${citation.index}]`);
    } else {
      $el.replaceWith($el.text().replace(/[\[\]]/g, ""));
    }
  });

  // Convert wiki links to full URLs
  $("a[href^='/wiki/']").each((_, el) => {
    let href = $(el).attr("href");
    // Decode URL encoding safely (e.g. %28 -> (), %29 -> ))
    try { href = decodeURIComponent(href); } catch {}
    $(el).attr("href", `https://en.wikipedia.org${href}`);
  });

  // Remove non-content: edit links, references, navboxes, styles
  $(".mw-editsection, .mw-editsection-bracket, .references, ol.references, .mw-references-wrap").remove();
  $(".side-box, .infobox, .navbox, .metadata, .thumb, .multiimage, .tmulti, table.mw-wiki").remove();
  $("style[data-mw-deduplicate], style").remove();

  // Remove elements containing cite error messages
  $("[class*='Cite'], [class*='error']").remove();

  return turndown.turndown($.html())
    .replace(/\\\[(\d+)\\\]/g, "[$1]")
    // Fix Turndown escaping of parentheses in URLs
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")");
}

/**
 * Extract lead paragraph text from HTML
 * Wikipedia returns full page HTML - we need to extract just the lead content
 * @param {string} html - Raw HTML from Wikipedia API
 * @returns {string} Clean lead text
 */
function extractLeadText(html) {
  const $ = cheerio.load(html);
  
  // Remove non-content elements
  $(".mw-editsection, .references, .printfooter, .catlinks, ol.references, .mw-references-wrap").remove();
  
  // Get text from first few paragraphs (lead section)
  // Skip empty ones and accumulate until we have substantial text
  let leadText = "";
  $("p").each((i, el) => {
    if (i >= 3) return false; // Only first 3 paragraphs
    const text = $(el).text().trim();
    if (text.length > 50) { // Skip short paragraphs
      leadText += text + " ";
    }
  });
  
  // Remove citation markers like [1], [2]
  leadText = leadText.replace(/\[\d+\]/g, "");
  
  return leadText.replace(/\s+/g, " ").trim();
}

/**
 * Fetch and parse Wikipedia page using MediaWiki API
 */
async function fetchWikiPage({ page, section, limit = 3, useCache = false }) {
  // Determine filter type based on whether section is provided
  const filterType = section !== undefined ? "pageSection" : "pageOverview";
  // Search query: use "page section" for semantic search
  const searchQuery = section !== undefined ? `${page} ${section}` : page;

  // ==========================================================================
  // Step 1: Check vector cache first if useCache is true
  // ==========================================================================
  if (useCache) {
    try {
      const cachedResults = await searchVectorDB(searchQuery, limit, filterType);

      if (cachedResults && cachedResults.length > 0) {
        // For pageSection, we searched with "page section" so semantic search did the work
        // We just need to confirm the article matches
        const matching = cachedResults.find((r) => {
          return r.metadata?.article === page;
        });

        if (matching) {
          recordVectorHit(section ? "section" : "page");
          recordArticle(page);
          const content = `[Cache hit]\n\n${matching.document}\n\n_Cache hit - retrieved from local vector database_`;
          reportFetchResult(page, section, content);
          return content;
        }
      }
    } catch (error) {
      // Cache lookup failed, continue to web fetch
      console.error("[fetchWikiPage] fetchWikiPage() cache lookup failed:", error.message);
    }
  }

  // ==========================================================================
  // Step 2: Cache miss - Fetch from Wikipedia API
  // ==========================================================================
  try {
    const baseUrl = "https://en.wikipedia.org/w/api.php";
    const userAgent = "EVPAgent/1.0 (https://github.com/jinyang6/EVPAgent; jiatom519@gmail.com)";
    const pageUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(page.replace(/ /g, "_"))}`;

    // Build API params - always fetch HTML for processing
    const params = {
      action: "parse",
      page: page,
      prop: "text|tocdata",
      format: "json",
    };

    // Fetch page first to get sections list
    const response = await axios.get(baseUrl, {
      params,
      headers: { "User-Agent": userAgent },
      timeout: 15000,
    });

    const data = response.data;

    if (!data?.parse) {
      return `Wikipedia page "${page}" not found.`;
    }

    const html = data.parse.text?.["*"] || "";
    const sectionsData = data.parse.tocdata?.sections || [];
    const pageTitle = data.parse.title || page;

    // Handle section-specific fetch
    if (section !== undefined) {
      // Find section index by matching section title
      const sectionData = sectionsData.find(
        (s) => s.line === section || s.anchor === section.replace(/ /g, "_")
      );

      if (!sectionData) {
        return `Section "${section}" not found on page "${pageTitle}".`;
      }

      const sectionIndex = parseInt(sectionData.index, 10);
      const sectionAnchor = sectionData.anchor || section.replace(/ /g, "_");
      const sectionUrl = `${pageUrl}#${sectionAnchor}`;

      // Fetch specific section content using index
      const sectionParams = {
        action: "parse",
        page: page,
        section: sectionIndex,
        prop: "text",
        format: "json",
      };

      const sectionResponse = await axios.get(baseUrl, {
        params: sectionParams,
        headers: { "User-Agent": userAgent },
        timeout: 15000,
      });

      const sectionHtml = sectionResponse.data?.parse?.text?.["*"] || "";
      const markdown = htmlToMarkdown(sectionHtml, pageTitle);
      const content = `# ${pageTitle} - ${section}\n**Source:** ${sectionUrl}\n\n${markdown}`;

      // Record web request and article, then store to vector DB (fire and forget)
      recordWebRequest("section");
      recordArticle(page);
      upsertWikiPage(page, section, markdown).catch((error) => {
        console.error("[fetchWikiPage] fetchWikiPage() failed to cache section:", error.message);
      });

      // Report result
      reportFetchResult(page, section, content);

      return content;
    }

    // No section - get overview + section list
    const leadText = extractLeadText(html);

    // Build result with overview and section list
    let result = `# ${pageTitle}\n**Source:** ${pageUrl}\n\n`;
    result += `## Overview\n${leadText}\n\n`;
    result += `## Sections (${sectionsData.length})\n`;

    if (sectionsData.length > 0) {
      sectionsData.forEach((s) => {
        result += `- [${s.line}] ${s.anchor ? `(anchor: ${s.anchor})` : ""}\n`;
      });
    } else {
      result += `No sections found.\n`;
    }

    result += `\n---\n\n**Full section available - ask to fetch specific sections by anchor.**`;

    // Record web request and article, then store overview to vector DB (fire and forget)
    recordWebRequest("page");
    recordArticle(page);
    upsertWikiPage(page, "", result).catch((error) => {
      console.error("[fetchWikiPage] fetchWikiPage() failed to cache overview:", error.message);
    });

    // Report result
    reportFetchResult(page, null, result);

    return result;

  } catch (error) {
    if (error.response?.status === 404) {
      return `Wikipedia page "${page}" not found.`;
    }
    return `Error fetching Wikipedia page: ${error.message}`;
  }
}

export const fetchWikiPageTool = tool(
  fetchWikiPage,
  {
    name: "fetchWikiPage",
    description: `Fetch Wikipedia page content.

Parameters:
- page (required): Wikipedia page title (e.g., "Mars")
- section (optional): Section anchor (e.g., "Twin_rover", omit for overview)
- limit (optional, default=3): Vector cache top-k
- useCache (optional, default=true): Set to false to force web fetch

Without section: returns overview + section list.
With section: returns full section content in Markdown.
"[Cache hit]" if from vector cache.`,
    schema: wikiPageSchema,
  }
);
