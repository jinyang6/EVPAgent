import axios from "axios";
import { readFileSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import { getUserPromptsDir } from "../../../utils/appDataPaths.mjs";

// ============================================================================
// Constants
// ============================================================================

export const WIKI_BASE_URL = "https://en.wikipedia.org/w/api.php";
export const WIKI_USER_AGENT = "EVPAgent/1.0 (https://github.com/jinyang6/EVPAgent; jiatom519@gmail.com)";

// ============================================================================
// Session manifest reporting
// ============================================================================

/**
 * Report a Wikipedia tool result to session_manifest.json
 * @param {string} toolName - 'searchWikipedia' or 'fetchWikiPage'
 * @param {object} args - tool arguments
 * @param {string} result - result content (truncated to 1000 chars)
 */
export function reportWikiResult(toolName, args, result) {
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
      tool: toolName,
      arguments: args,
      result: result.slice(0, 1000),
      timestamp: new Date().toISOString()
    });

    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  } catch (error) {
    console.error(`[wikipediaHelpers::reportWikiResult] failed:`, error.message);
  }
}

// ============================================================================
// API helpers
// ============================================================================

/**
 * Make a Wikipedia API request.
 * @param {string} action - e.g. "parse" or "query"
 * @param {object} params - API parameters
 * @returns {Promise<object>} parsed JSON response
 */
export async function wikiRequest(action, params) {
  const urlParams = new URLSearchParams({ action, format: "json", ...params });

  const response = await axios.get(WIKI_BASE_URL, {
    params: urlParams,
    headers: { "User-Agent": WIKI_USER_AGENT },
    timeout: 15000,
  });
  return response.data;
}

/**
 * Build Wikipedia article URL from page title
 * @param {string} page - page title
 * @param {string} [section] - optional section anchor
 * @returns {string} full URL
 */
export function buildWikiUrl(page, section) {
  const base = `https://en.wikipedia.org/wiki/${encodeURIComponent(page.replace(/ /g, "_"))}`;
  return section ? `${base}#${section.replace(/ /g, "_")}` : base;
}

// ============================================================================
// Wikitext parsing helpers
// ============================================================================

/**
 * Parse wikitext links to clickable URLs
 * [[Page]] → [https://en.wikipedia.org/wiki/Page Page]
 * [[Page|text]] → [https://en.wikipedia.org/wiki/Page text]
 * [[Page#Section|text]] → [https://en.wikipedia.org/wiki/Page#Section text]
 * @param {string} wikitext - Raw wikitext with [[...]] links
 * @returns {string} Wikitext with links converted to URL format
 */
export function parseWikitext(wikitext) {
  if (!wikitext) return wikitext;

  // Pattern: [[PageOrSection|DisplayText]] or [[PageOrSection]]
  const linkPattern = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;

  return wikitext.replace(linkPattern, (match, pagePart, displayText) => {
    const display = displayText || pagePart.split('#')[0];
    const url = `https://en.wikipedia.org/wiki/${pagePart.replace(/ /g, "_")}`;
    return `[${url} ${display}]`;
  });
}

// ============================================================================
// File/Image helpers
// ============================================================================

/**
 * Fetch image/file info from Wikipedia/Commons.
 *
 * Uses action=query with prop=imageinfo to retrieve the direct media URL
 * and description page URL for a given file title (e.g. from wikitext [[File: ...]]).
 *
 * Requests only iiprop=url to minimize payload — descriptionurl is included by
 * default, and the media type is inferred from the file extension client-side.
 *
 * @param {string} fileTitle - File title,
 *   e.g. "BBH gravitational lensing of gw150914.webm"
 * @returns {Promise<{title: string, url: string, descriptionurl: string}|null>}
 *   Object with title, url, descriptionurl; or null if not found / error
 *
 * @example
 *   const info = await fetchWikiImageInfo("BBH gravitational lensing of gw150914.webm");
 *   // => { title: "File:BBH gravitational lensing of gw150914.webm",
 *   //      url: "https://upload.wikimedia.org/...",
 *   //      descriptionurl: "https://commons.wikimedia.org/..." }
 */
export async function fetchWikiImageInfo(fileTitle) {
  try {
    // Auto-prepend "File:" prefix if missing
    const title = fileTitle.startsWith("File:") ? fileTitle : `File:${fileTitle}`;

    const data = await wikiRequest("query", {
      prop: "imageinfo",
      iiprop: "url",
      titles: title,
    });

    const pages = data?.query?.pages;
    if (!pages) return null;

    // Pages may include "-1" (missing) keys even for valid Commons files.
    // The only reliable signal: imageinfo[0].url exists.
    const page = Object.values(pages)[0];
    if (!page) return null;

    const info = page.imageinfo?.[0];
    if (!info?.url) return null;

    return {
      title: page.title,
      url: info.url,
      descriptionurl: info.descriptionurl,
    };
  } catch (error) {
    console.error(`[fetchWikiImageInfo] failed for "${fileTitle}":`, error.message);
    return null;
  }
}