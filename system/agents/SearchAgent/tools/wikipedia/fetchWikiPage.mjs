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
  limit: z.number().optional().default(3).describe('Vector cache top-k for semantic search'),
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
function htmlToMarkdown(html, pageTitle = "") {
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
    // Decode HTML entities in id (e.g., &#95; -> _)
    const id = decodeHtmlEntities($el.attr("id") || "");
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
      if (citation.url) {
        $el.replaceWith(`[${citation.index}](${citation.url})`);
      } else {
        // No external URL - link to Wikipedia citation anchor
        const citeUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(pageTitle)}#${citeId}`;
        $el.replaceWith(`[${citation.index}](${citeUrl})`);
      }
    } else {
      // Fallback: use bracket format to prevent text concatenation
      const text = $el.text().replace(/[\[\]]/g, "").trim();
      if (text) {
        $el.replaceWith(`[${text}]`);
      } else {
        $el.remove();
      }
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
    // Fix Turndown escaping of parentheses and underscores in URLs
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\_/g, "_");
}

/**
 * Extract lead HTML from Wikipedia page content
 * Extracts all content before the first h2 heading (the lead section)
 * @param {string} html - Raw HTML from Wikipedia API
 * @returns {string} HTML containing only the lead content
 */
function extractLeadHtml(html) {
  const $ = cheerio.load(html);

  // Remove elements that should not be part of lead content
  $(".shortdescription, .mw-empty-elt, figure, style, .mw-editsection").remove();

  // Find the container with the actual content
  const container = $(".mw-parser-output");
  if (!container.length) {
    return "";
  }

  // Collect all elements before the first h2
  let leadHtml = "";
  let reachedSection = false;

  container.children().each((_, el) => {
    const $el = $(el);

    // Check if this element is or contains an h2 (first section heading)
    if ($el.is("h2") || $el.find("h2").length > 0 || $el.is("meta[property='mw:PageProp/toc']")) {
      reachedSection = true;
      return false; // break - stop collecting
    }

    // Don't include certain elements in lead
    // Note: ol.references is kept for citation lookup in htmlToMarkdown()
    if ($el.is(".references, .mw-references-wrap, .catlinks, .printfooter")) {
      return; // continue
    }

    // Include this element's HTML
    leadHtml += $.html(el) + "\n";
  });

  return `<div class="mw-parser-output">\n${leadHtml}</div>`;
}

/**
 * Extract section HTML by section index
 * @param {string} html - Full page HTML from Wikipedia API
 * @param {number} sectionIndex - Section index to extract
 * @returns {string} HTML containing only that section's content
 */
function extractSectionHtml(html, sectionIndex) {
  const $ = cheerio.load(html);
  const container = $(".mw-parser-output");

  if (!container.length) {
    return "";
  }

  const headings = [];
  container.children("h2").each((i, el) => {
    headings.push({ index: i, el: el, $el: $(el) });
  });

  // If sectionIndex is 0, it's the lead (already handled separately)
  // Otherwise find the h2 at the section index
  if (sectionIndex === 0) {
    // Return everything before first h2
    return extractLeadHtml(html);
  }

  // Find the target h2
  const targetHeading = headings[sectionIndex - 1]; // -1 because h2 indices are 0-based after lead
  if (!targetHeading) {
    return "";
  }

  // Find the next h2 or end of content
  const startIdx = container.children().index(targetHeading.el);
  let endIdx = container.children().length;

  if (headings[sectionIndex]) {
    endIdx = container.children().index(headings[sectionIndex].el);
  }

  // Extract elements from start to end
  let sectionHtml = "";
  container.children().slice(startIdx, endIdx).each((_, el) => {
    sectionHtml += $.html(el) + "\n";
  });

  return `<div class="mw-parser-output">\n${sectionHtml}</div>`;
}

/**
 * Fetch and parse Wikipedia page using MediaWiki API
 */
async function fetchWikiPage({ page, section, limit = 3, useCache = true }) {
  // ==========================================================================
  // Step 1: Check vector cache if useCache is true
  // ==========================================================================
  if (useCache) {
    const filterType = section !== undefined ? "pageSection" : "pageOverview";
    const searchQuery = section !== undefined ? `${page} ${section}` : page;
    try {
      const cachedResults = await searchVectorDB(searchQuery, limit, filterType);
      if (cachedResults && cachedResults.length > 0) {
        const matching = cachedResults.find((r) => r.metadata?.article === page);
        if (matching) {
          recordVectorHit(section ? "section" : "page");
          recordArticle(page);
          const content = `[Cache hit]\n\n${matching.document}\n\n_Cache hit - retrieved from local vector database_`;
          reportFetchResult(page, section, content);
          return content;
        }
      }
    } catch (error) {
      console.error("[fetchWikiPage] cache lookup failed:", error.message);
    }
  }

  // ==========================================================================
  // Step 2: Fetch from Wikipedia API
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
    // Extract lead HTML and convert to markdown for full content
    const leadHtml = extractLeadHtml(html);

    // Extract references section from full page HTML (needed for citation lookups)
    // References are at the end, after all sections, so we need to include them
    const $full = cheerio.load(html);
    const referencesHtml = $full("ol.references").html() || "";

    // Combine lead HTML with references for citation lookup
    const combinedHtml = leadHtml.replace("</div>", `<ol class="references">${referencesHtml}</ol></div>`);

    const leadMarkdown = htmlToMarkdown(combinedHtml, pageTitle);

    // Build result with overview and section list
    let result = `# ${pageTitle}\n**Source:** ${pageUrl}\n\n`;
    result += `## Overview\n${leadMarkdown}\n\n`;
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
    // Store the formatted result with section list for complete context
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
- limit (optional, default=3): Vector cache top-k for semantic search
- useCache (optional, default=true): Set to false to force web fetch

Without section: returns overview + section list.
With section: returns full section content in Markdown.
"[Cache hit]" if from vector cache.`,
    schema: wikiPageSchema,
  }
);
