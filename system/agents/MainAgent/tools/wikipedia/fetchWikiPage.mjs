import { tool } from "@langchain/core/tools";
import z from "zod";
import {
  searchVectorDB,
  upsertWikiPage,
} from "../vector/vectorHelpers.mjs";
import {
  recordVectorHit,
  recordWebRequest,
  recordArticle,
} from "../stats.mjs";
import { wikiRequest, reportWikiResult, buildWikiUrl, parseWikitext } from "./wikipediaHelpers.mjs";

/**
 * Schema for fetchWikiPage tool
 */
const wikiPageSchema = z.object({
  page: z.string().describe('Wikipedia page title (e.g., "Mars")'),
  sectionIndex: z.number().optional().describe('Section index: Omit=overview (lead), 1+=specific section.'),
  limit: z.number().optional().default(3).describe('Vector cache top-k for semantic search'),
  useCache: z.boolean().optional().default(true).describe('Whether to use vector cache for retrieval'),
});

// ============================================================================
// Main tool
// ============================================================================

/**
 * Fetch Wikipedia page content in wikitext format.
 *
 * Flow:
 * - Overview (no sectionIndex or sectionIndex=0): prop=tocdata → get sections, then prop=wikitext&section=0 → get overview
 * - Section (sectionIndex > 0): prop=wikitext&section=N → get section wikitext
 */
async function fetchWikiPage({ page, sectionIndex, limit = 3, useCache = true }) {
  const normalizedSectionIndex = sectionIndex ?? 0;
  const pageUrl = buildWikiUrl(page);

  // --- Cache lookup ---
  async function cacheLookup() {
    const filterType = sectionIndex !== undefined && sectionIndex > 0 ? "pageSection" : "pageOverview";
    const cacheKey = sectionIndex !== undefined ? `${page}:${sectionIndex}` : page;
    const cachedResults = await searchVectorDB(cacheKey, limit, filterType);
    if (cachedResults && cachedResults.length > 0) {
      const matching = cachedResults.find(
        (r) => r.metadata?.article === page && r.metadata?.sectionIndex === normalizedSectionIndex
      );
      if (matching) {
        recordVectorHit(normalizedSectionIndex !== 0 ? "section" : "page");
        recordArticle(page);
        const sectionIdx = matching.metadata?.sectionIndex;
        const sectionNote = sectionIdx !== undefined ? `(index: ${sectionIdx})` : "";
        const content = `[Cache hit] ${sectionNote}\n\n${matching.document}\n\n_Cache hit - retrieved from local vector database_`;
        reportWikiResult('fetchWikiPage', { page, sectionIndex: normalizedSectionIndex }, content);
        return content;
      }
    }
    return null;
  }

  // --- Cache section content ---
  async function cacheSection(sectionName, wikitext, idx) {
    await upsertWikiPage(page, sectionName, wikitext, idx);
  }

  // --- Cache overview content ---
  async function cacheOverview(wikitext) {
    await upsertWikiPage(page, "", wikitext, 0);
  }

  // Check vector cache
  if (useCache) {
    try {
      const cached = await cacheLookup();
      if (cached) return cached;
    } catch (error) {
      console.error("[fetchWikiPage::cacheLookup] failed:", error.message);
    }
  }

  try {
    const isSection = sectionIndex !== undefined && sectionIndex > 0;
    let sectionsData = [];
    let wikitext = "";
    let pageTitle = page;

    if (isSection) {
      // Section N: wikitext only
      const data = await wikiRequest("parse", { page, prop: "wikitext", section: sectionIndex, redirects: "true" });
      if (!data?.parse) return `Wikipedia page "${page}" not found.`;

      wikitext = data.parse.wikitext?.["*"] || "";
      pageTitle = data.parse.title || page;

      // Section title is at the start of wikitext, e.g. "== Section Name =="
      const headerMatch = wikitext.match(/^==+\s*([^=]+?)\s*==+\s*/);
      const sectionName = headerMatch ? headerMatch[1].trim() : `Section ${sectionIndex}`;
      const sectionAnchor = sectionName.replace(/ /g, "_");
      const content = `# ${pageTitle} - ${sectionName} (index: ${sectionIndex})\n**Source:** ${pageUrl}#${sectionAnchor}\n\n${parseWikitext(wikitext)}`;

      recordWebRequest("section");
      recordArticle(page);
      cacheSection(sectionName, wikitext, sectionIndex).catch((error) => {
        console.error("[fetchWikiPage::cacheSection] failed:", error.message);
      });

      reportWikiResult('fetchWikiPage', { page, sectionIndex }, content);
      return content;
    }

    // Overview: fetch tocdata and wikitext&section=0 in parallel
    const [tocData, overviewData] = await Promise.all([
      wikiRequest("parse", { page, prop: "tocdata", redirects: "true" }),
      wikiRequest("parse", { page, prop: "wikitext", section: 0, redirects: "true" }),
    ]);

    if (!tocData?.parse) return `Wikipedia page "${page}" not found.`;

    sectionsData = tocData.parse.tocdata?.sections || [];
    pageTitle = tocData.parse.title || page;
    wikitext = overviewData.parse?.wikitext?.["*"] || "";

    let result = `# ${pageTitle}\n**Source:** ${pageUrl}\n\n`;
    result += `## Overview\n${parseWikitext(wikitext)}\n\n`;
    result += `## Sections (${sectionsData.length})\n`;

    if (sectionsData.length > 0) {
      sectionsData.forEach((s) => {
        if (!["Notes", "References", "External links", "See also"].includes(s.line)) {
          result += `- [${s.line}] (index: ${s.index})${s.anchor ? `, anchor: ${s.anchor}` : ""}\n`;
        }
      });
    } else {
      result += `No sections found.\n`;
    }

    result += `\n---\n\n**Full section available - specify index to fetch.**`;

    recordWebRequest("page");
    recordArticle(page);
    cacheOverview(wikitext).catch((error) => {
      console.error("[fetchWikiPage::cacheOverview] failed:", error.message);
    });

    reportWikiResult('fetchWikiPage', { page, sectionIndex: normalizedSectionIndex }, result);
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

Wikitext input uses markup (for reference):
- [[Page Name]] for links to other Wikipedia page (e.g., [[Mars]])
- [[Page#Section|Display Text]] for links to specific sections (e.g., [[Mars#Formation|Martain history]])
- {{sfn|Author|Year|page=X}} or {{cite web|...}} for citations

Output format:
- [[Page]] or [[Page|text]] links are converted to [https://en.wikipedia.org/wiki/Page text] clickable URLs
- [[Page#Section|text]] is converted to [https://en.wikipedia.org/wiki/Page#Section text]
- Cache stores RAW wikitext for editing purposes

When to use:
- First fetch a page OVERVIEW (no sectionIndex) to see all available sections and their indexes
- Then fetch SPECIFIC SECTIONS by their index when you need detailed content
- Use for: reading article sections, gathering citations, editing Wikipedia content

Parameters:
- page (required): Wikipedia page title (e.g., "Mars", "Art Deco", "Streamline Moderne")
- sectionIndex (optional): Omitted=overview with section list, 1+=specific section
- limit (optional, default=3): Vector cache top-k for semantic search
- useCache (optional, default=true): Set to false to force web fetch

Returns:
- Overview: page title, content with clickable links, and numbered section list with indexes and anchors
- Section: section content with clickable links

Example usage:
1. fetchWikiPage({ page: "Mars" }) → overview + [1: "Discovery", 2: "Geography", ...]
2. fetchWikiPage({ page: "Mars", sectionIndex: 2 }) → "Geography" section content`,
    schema: wikiPageSchema,
  }
);