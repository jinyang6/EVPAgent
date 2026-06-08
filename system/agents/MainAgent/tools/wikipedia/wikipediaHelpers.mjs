import axios from "axios";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { getUserPromptsDir } from "../../../utils/appDataPaths.mjs";

// ============================================================================
// Constants
// ============================================================================

export const WIKI_BASE_URL = "https://en.wikipedia.org/w/api.php";
export const WIKI_USER_AGENT = "EVPAgent/1.0 (https://github.com/jinyang6/EVPAgent; jiatom519@gmail.com)";

// ============================================================================
// Network diagnostics
// ============================================================================

/**
 * Translate an axios/network error into a human-readable cause ("why").
 * Distinguishes the failure modes that behave differently between the dev
 * CLI (Node network stack) and the packaged Electron app (proxy/DNS/TLS):
 *   - ECONNABORTED / ETIMEDOUT  → request exceeded the timeout
 *   - ENOTFOUND / EAI_AGAIN     → DNS could not resolve the host
 *   - ECONNREFUSED              → host reachable but refused the connection
 *   - ECONNRESET / EPIPE        → connection dropped mid-flight
 *   - CERT_* / UNABLE_TO_*      → TLS/certificate validation failed
 *   - HTTP status               → server responded with an error code
 * @param {Error} error - The thrown axios/network error
 * @returns {string} Single-line cause description
 */
export function describeNetworkError(error) {
  const code = error?.code;
  const status = error?.response?.status;

  if (status) {
    return `HTTP ${status} ${error.response.statusText || ""}`.trim();
  }
  switch (code) {
    case "ECONNABORTED":
    case "ETIMEDOUT":
      return `request timed out after ${error?.config?.timeout ?? "?"}ms (code ${code})`;
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return `DNS resolution failed for host (code ${code}) — check network/proxy`;
    case "ECONNREFUSED":
      return `connection refused (code ${code})`;
    case "ECONNRESET":
    case "EPIPE":
      return `connection reset mid-request (code ${code})`;
    default:
      if (typeof code === "string" && /CERT|TLS|SSL|UNABLE_TO/i.test(code)) {
        return `TLS/certificate failure (code ${code})`;
      }
      return code ? `${error.message} (code ${code})` : error?.message || "unknown error";
  }
}

/**
 * Log a network failure in the project's standard `[file::fn] why` format.
 * @param {string} file - Source file name (e.g. "wikipediaHelpers")
 * @param {string} fn - Function name where the failure occurred
 * @param {Error} error - The thrown error
 * @param {string} [context] - Optional extra context (e.g. the query/page)
 */
export function logNetworkError(file, fn, error, context = "") {
  const why = describeNetworkError(error);
  const ctx = context ? ` (${context})` : "";
  console.error(`[${file}::${fn}]${ctx} ${why}`);
}

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

    // Ensure the prompts directory exists. In packaged builds a tool can fire
    // before the prompt-files bootstrap has created this dir, and writeFileSync
    // would otherwise throw ENOENT and silently drop the manifest update.
    if (!existsSync(promptsDir)) {
      mkdirSync(promptsDir, { recursive: true });
    }

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

  try {
    const response = await axios.get(WIKI_BASE_URL, {
      params: urlParams,
      headers: { "User-Agent": WIKI_USER_AGENT },
      timeout: 15000,
    });
    return response.data;
  } catch (error) {
    // Log the precise cause (timeout / DNS / TLS / HTTP) before re-throwing so
    // callers' generic catch blocks still run, but the root cause is recorded.
    logNetworkError("wikipediaHelpers", "wikiRequest", error, `action=${action}`);
    throw error;
  }
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
    logNetworkError("wikipediaHelpers", "fetchWikiImageInfo", error, `file="${fileTitle}"`);
    return null;
  }
}