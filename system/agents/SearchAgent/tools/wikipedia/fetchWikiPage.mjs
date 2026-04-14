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
    console.error("[fetchWikiPage] Failed to report result:", error.message);
  }
}

/**
 * Schema for fetchWikiPage tool
 */
const wikiPageSchema = z.object({
  page: z.string().describe('Wikipedia page title (e.g., "Mars")'),
  section: z.string().optional().describe('Section title to fetch (e.g., "Formation", omit for overview)'),
  limit: z.number().optional().default(3).describe('Number of results from vector cache (top-k)'),
  useCache: z.boolean().optional().default(true).describe('Whether to use vector cache for retrieval'),
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
function htmlToMarkdown(html, pageTitle) {
  const $ = cheerio.load(html);
  
  // Configure turndown with custom rule to handle escaped brackets
  const turndownService = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
  });
  
  // Add rule to unescape citation brackets like \[1\] or \[2\]
  turndownService.addRule("unEscapeCitationBrackets", {
    filter: function(node) {
      return node.nodeName === "TEXT";
    },
    replacement: function(content) {
      return content.replace(/\\\[(\d+)\\\]/g, "[$1]");
    },
  });

  // 1. Build citation map from references section
  const citationMap = new Map();
  let citationIndex = 1;

  $("ol.references li").each((_, el) => {
    const $el = $(el);
    const rawId = $el.attr("id") || "";
    const decodedId = decodeHtmlEntities(rawId);
    const refLink = $el.find("a.external").first().attr("href") || "";
    const refText = $el.text().trim();
    
    const cleanText = refText.replace(/^\[\d+\]\s*/, "").slice(0, 150);
    
    // Skip broken citations (Cite error: named reference X was invoked but never defined)
    if (cleanText.includes("Cite error") || cleanText.includes("invoked but never defined")) {
      return;
    }
    
    const citation = { index: citationIndex, text: cleanText, url: refLink };
    
    // Store with various forms for reliable lookup
    citationMap.set(rawId, citation);
    citationMap.set(decodedId, citation);
    citationIndex++;
  });

  // 2. Replace citation superscripts with inline markers
  $("sup").each((_, el) => {
    const $el = $(el);
    const classes = $el.attr("class") || "";
    
    if (classes.includes("reference") || classes.includes("citation")) {
      const rawHref = $el.find("a").attr("href") || "";
      const decodedHref = decodeHtmlEntities(rawHref);
      const match = decodedHref.match(/#(cite_note-[^"]+)/);
      const refId = match ? match[1] : null;
      
      if (refId && citationMap.has(refId)) {
        const citation = citationMap.get(refId);
        if (citation.url) {
          $el.replaceWith(`[${citation.index}](${citation.url})`);
        } else {
          $el.replaceWith(`[${citation.index}]`);
        }
      } else {
        $el.replaceWith($el.text().replace(/[\[\]]/g, ""));
      }
    }
  });

  // 3. Convert internal wiki links to full URLs
  $("a").each((_, el) => {
    const $el = $(el);
    let href = $el.attr("href") || "";
    
    if (!href || href.startsWith("//") || href.startsWith("http")) return;
    
    if (href.startsWith("/wiki/")) {
      const encodedTitle = href.slice(6);
      $el.attr("href", `https://en.wikipedia.org/wiki/${encodedTitle}`);
    } else if (href.startsWith("/w/")) {
      const titleMatch = href.match(/title=([^&]+)/);
      if (titleMatch) {
        $el.attr("href", `https://en.wikipedia.org/wiki/${titleMatch[1]}`);
      }
    }
  });

  // 4. Remove edit section links
  $(".mw-editsection").remove();
  $(".mw-editsection-bracket").parent().remove();

  // 5. Remove reference list from bottom
  $(".references, ol.references, .mw-references-wrap").remove();

  // 6. Clean up empty elements
  $("div.empty, span.empty").remove();

  // 7. Convert to markdown
  let markdown = turndownService.turndown($.html());
  
  // 8. Clean up any remaining escaped brackets
  markdown = markdown.replace(/\\\[(\d+)\\\]/g, "[$1]");

  return markdown;
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
async function fetchWikiPage({ page, section, limit = 3, useCache = true }) {
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
      console.error("[fetchWikiPage] Cache lookup failed:", error.message);
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
      prop: "text|sections",
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
    const sectionsData = data.parse.sections || [];
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
      const content = `# ${pageTitle} - ${section}\n**Source:** ${sectionUrl}\n\n## ${section}\n\n${markdown.slice(0, 4000)}`;

      // Record web request and article, then store to vector DB (fire and forget)
      recordWebRequest("section");
      recordArticle(page);
      upsertWikiPage(page, section, markdown.slice(0, 4000)).catch((error) => {
        console.error("[fetchWikiPage] Failed to cache section:", error.message);
      });

      // Report result
      reportFetchResult(page, section, content);

      return content;
    }

    // No section - get overview + section list
    const leadText = extractLeadText(html);

    // Build result with overview and section list
    let result = `# ${pageTitle}\n**Source:** ${pageUrl}\n\n`;
    result += `## Overview\n${leadText.slice(0, 800)}\n\n`;
    result += `## Sections (${sectionsData.length})\n`;

    if (sectionsData.length > 0) {
      sectionsData.forEach((s) => {
        result += `- [${s.line}] ${s.anchor ? `(anchor: ${s.anchor})` : ""}\n`;
      });
    } else {
      result += `No sections found.\n`;
    }

    result += `\n---\n\n**Full content available - ask to fetch specific sections by title.**`;

    // Record web request and article, then store overview to vector DB (fire and forget)
    recordWebRequest("page");
    recordArticle(page);
    upsertWikiPage(page, "", result).catch((error) => {
      console.error("[fetchWikiPage] Failed to cache overview:", error.message);
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
- section (optional): Section title (e.g., "Formation", omit for overview)
- limit (optional, default=3): Vector cache top-k
- useCache (optional, default=true): Set to false to force web fetch

Without section: returns overview + section list.
With section: returns full section content in Markdown.
"[Cache hit]" if from vector cache.`,
    schema: wikiPageSchema,
  }
);
