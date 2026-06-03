import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import axios from "axios";
import { connect } from "@lancedb/lancedb";
import { OpenAIEmbeddings } from "@langchain/openai";
import { getConfig } from "../../../../../src/config.mjs";

// ============================================================================
// Constants
// ============================================================================

const TABLE_NAME = "evpagent_wikipedia";
const USER_AGENT = "EVPAgent/1.0 (https://github.com/jinyang6/EVPAgent; jiatom519@gmail.com)";

// ============================================================================
// Path Resolution - Platform-aware storage location
// ============================================================================

/**
 * Get the platform-appropriate LanceDB storage path
 * @returns {string} Platform-specific path to LanceDB data directory
 */
export function getVectorDBPath() {
  const homeDir = os.homedir();

  if (process.platform === "win32") {
    // Windows: %APPDATA%\EVPAgent\lancedb\
    return process.env.APPDATA
      ? path.join(process.env.APPDATA, "EVPAgent", "lancedb")
      : path.join(homeDir, ".evpagent", "lancedb");
  }

  if (process.platform === "darwin") {
    // macOS: ~/Library/Application Support/EVPAgent/lancedb/
    return path.join(homeDir, "Library", "Application Support", "EVPAgent", "lancedb");
  }

  // Linux (and others): ~/.config/EVPAgent/lancedb/ or $XDG_CONFIG_HOME
  return process.env.XDG_CONFIG_HOME
    ? path.join(process.env.XDG_CONFIG_HOME, "evpagent", "lancedb")
    : path.join(homeDir, ".config", "evpagent", "lancedb");
}

// ============================================================================
// Embeddings - OpenRouter qwen/qwen3-embedding-8b
// ============================================================================

let _cachedEmbeddingsInstance = null;
let _cachedEmbeddingsKey = undefined; // key used for the cached instance

/**
 * Get the OpenAI-compatible embeddings instance configured for OpenRouter.
 * Model settings are read from config.json (embeddingModel section).
 * The instance is cached and reused unless the apiKey changes between calls.
 * @param {string|null} apiKey - OpenRouter API key (same key used for search model)
 * @returns {OpenAIEmbeddings}
 */
export function getEmbeddings(apiKey) {
  const { embeddingModel } = getConfig();
  // Normalize so null / "" / undefined collapse to one canonical value —
  // otherwise the cache key (raw apiKey) and the instance (apiKey || undefined)
  // can disagree, leaving a keyless instance serving later authenticated calls.
  const normalizedKey = apiKey || undefined;
  if (!_cachedEmbeddingsInstance || _cachedEmbeddingsKey !== normalizedKey) {
    _cachedEmbeddingsInstance = new OpenAIEmbeddings({
      model: embeddingModel.modelId,
      apiKey: normalizedKey,
      configuration: {
        baseURL: embeddingModel.baseUrl,
      },
    });
    _cachedEmbeddingsKey = normalizedKey;
  }
  return _cachedEmbeddingsInstance;
}

// ============================================================================
// LanceDB Client & Table
// ============================================================================

let db = null;
let table = null;

/**
 * Get or create the LanceDB connection and table
 * @param {string|null} apiKey - OpenRouter API key, used when creating the table's schema placeholder
 * @returns {Promise<Table>}
 */
export async function getTable(apiKey = null) {
  if (!table) {
    const dbPath = getVectorDBPath();
    db = await connect(dbPath);

    try {
      // Try to open existing table
      table = await db.openTable(TABLE_NAME);
    } catch (error) {
      // Table doesn't exist, create it

      // Create initial placeholder record to establish schema
      const embeddings = getEmbeddings(apiKey);
      const placeholderVector = await embeddings.embedQuery("__init__");

      table = await db.createTable(TABLE_NAME, [
        {
          id: "__init__",
          vector: placeholderVector,
          text: "__placeholder__",
          type: "placeholder",
          article: "",
          section: "",
          sectionIndex: 0,
          url: "",
          lastEdited: new Date().toISOString(),
        },
      ]);
    }
  }
  return table;
}

// ============================================================================
// Reset
// ============================================================================

/**
 * Reset vector DB - delete all data and reset singleton instances
 */
export async function resetVectorDB() {
  const { rmSync, existsSync } = await import("fs");
  const dbPath = getVectorDBPath();
  if (existsSync(dbPath)) {
    rmSync(dbPath, { recursive: true, force: true });
  }
  db = null;
  table = null;
  // Drop the cached embeddings instance too — its lazily-created OpenAI client
  // may hold a stale key/config that should not survive a reset.
  _cachedEmbeddingsInstance = null;
  _cachedEmbeddingsKey = undefined;
}

// ============================================================================
// ID Generation
// ============================================================================

/**
 * Generate a unique hash ID for a document
 * @param {string} type - Document type (wikipediaSearch, pageOverview, pageSection)
 * @param {string} article - Article title
 * @param {string} section - Section anchor text
 * @param {string} url - The stored URL
 * @returns {string} Hash-based unique ID
 */
export function generateDocId(type, article, section, url) {
  const raw = `${type}-${article}-${section}-${url}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

// ============================================================================
// Wikipedia API Helpers
// ============================================================================

/**
 * Fetch the last-edited timestamp for a Wikipedia page
 * @param {string} pageTitle - The Wikipedia page title
 * @returns {Promise<string>} ISO timestamp (e.g., "2026-04-10T00:21:57Z")
 */
export async function getLastEditedTime(pageTitle) {
  try {
    const params = new URLSearchParams({
      action: "query",
      titles: pageTitle,
      prop: "revisions",
      rvlimit: "1",
      rvprop: "timestamp",
      format: "json",
      utf8: "1",
    });

    const url = `https://en.wikipedia.org/w/api.php?${params.toString()}`;
    const response = await axios.get(url, {
      headers: { "User-Agent": USER_AGENT },
      timeout: 10000,
    });

    const pages = response.data?.query?.pages || {};
    const page = Object.values(pages)[0];

    if (page?.revisions?.[0]?.timestamp) {
      return page.revisions[0].timestamp;
    }

    return new Date().toISOString(); // Fallback to current time
  } catch (error) {
    console.error(`[VectorDB::getLastEditedTime] failed for ${pageTitle}:`, error.message);
    return new Date().toISOString(); // Fallback
  }
}

/**
 * Build the Wikipedia article URL (for user-facing links)
 * @param {string} article - Article title
 * @param {string|null} section - Section anchor text (null for overview)
 * @returns {string} Article URL
 */
export function buildWikiUrl(article, section = null) {
  const encodedTitle = encodeURIComponent(article.replace(/ /g, "_"));
  if (section) {
    const encodedSection = encodeURIComponent(section.replace(/ /g, "_"));
    return `https://en.wikipedia.org/wiki/${encodedTitle}#${encodedSection}`;
  }
  return `https://en.wikipedia.org/wiki/${encodedTitle}`;
}

/**
 * Build the Wikipedia API URL for fetching content
 * @param {string} article - Article title
 * @param {number|null} sectionIndex - Section index number (null for overview)
 * @returns {string} API URL
 */
export function buildWikiApiUrl(article, sectionIndex = null) {
  const encodedTitle = encodeURIComponent(article);
  if (sectionIndex !== null) {
    return `https://en.wikipedia.org/w/api.php?action=parse&page=${encodedTitle}&section=${sectionIndex}&prop=text`;
  }
  return `https://en.wikipedia.org/w/api.php?action=parse&page=${encodedTitle}&prop=text`;
}

// ============================================================================
// Vector DB Operations
// ============================================================================

/**
 * Search the vector database for relevant content
 * @param {string} query - Search query
 * @param {number} k - Number of results to return (default 3)
 * @param {string} filterType - Filter by type (required - e.g., 'wikipediaSearch', 'pageOverview', 'pageSection')
 * @param {string|null} apiKey - OpenRouter API key for embeddings
 * @returns {Promise<Array>} Array of {id, document, metadata} objects
 */
export async function searchVectorDB(query, k = 3, filterType, apiKey = null) {
  if (!filterType) {
    throw new Error("filterType is required for searchVectorDB");
  }

  try {
    const tbl = await getTable(apiKey);
    const embeddings = getEmbeddings(apiKey);

    // Embed the query
    const queryEmbedding = await embeddings.embedQuery(query);

    // Search the table using vector search
    const results = await tbl.search(queryEmbedding).limit(k * 2).toArray();

    // Format results and filter by type
    const formattedResults = results
      .filter((row) => row.type === filterType)
      .slice(0, k)
      .map((row) => ({
        id: row.id,
        document: row.text,
        metadata: {
          type: row.type,
          article: row.article,
          section: row.section,
          sectionIndex: row.sectionIndex,
          url: row.url,
          lastEdited: row.lastEdited,
        },
        distance: row._distance,
      }));

    return formattedResults;
  } catch (error) {
    // Don't fail the search - just log and return empty (will use web fallback)
    console.error(`[VectorDB::searchVectorDB] failed: ${error.message}. Falling back to web search.`);
    return [];
  }
}

/**
 * Store a wikiPage (overview or section) to the vector database
 * Stores the entire content as a single vector record for semantic search
 * @param {string} page - Article title
 * @param {string|null} section - Section anchor text (null/empty for overview)
 * @param {string} content - Page/section content (stored as whole, not chunked)
 * @returns {Promise<void>}
 */
export async function upsertWikiPage(page, section, content, sectionIndex = 0, apiKey = null) {
  try {
    const tbl = await getTable(apiKey);
    const embeddings = getEmbeddings(apiKey);

    // Build user-facing URL with section title directly (no API call needed)
    const url = buildWikiUrl(page, section);

    // Get last edited time (only for overview, not sections to reduce API calls)
    const lastEdited = await getLastEditedTime(page);

    // Generate ID for the page/section
    const id = generateDocId(
      section ? "pageSection" : "pageOverview",
      page,
      section || "",
      url
    );

    // Embed the entire content as a single vector
    const vector = await embeddings.embedQuery(content);

    // Store as single record
    await tbl.add([{
      id,
      vector,
      text: content,
      type: section ? "pageSection" : "pageOverview",
      article: page,
      section: section || "",
      sectionIndex: sectionIndex,
      url: url,
      lastEdited,
    }]);
  } catch (error) {
    // Don't throw - caching failure shouldn't break the tool
    console.error(`[VectorDB::upsertWikiPage] failed: ${error.message}`);
  }
}

// ============================================================================
// Utility - Format cached results for display
// ============================================================================

/**
 * Format cached search results for display
 * @param {Array} cachedResults - Results from searchVectorDB
 * @returns {string} Formatted string
 */
export function formatCachedSearchResults(cachedResults) {
  let output = "[Cache hit] Found relevant content:\n\n";

  // Group by type for better display
  const grouped = {
    wikipediaSearch: [],
    pageOverview: [],
    pageSection: [],
  };

  for (const result of cachedResults) {
    const type = result.metadata?.type || "unknown";
    if (grouped[type]) {
      grouped[type].push(result);
    }
  }

  // Format wikipediaSearch results
  if (grouped.wikipediaSearch.length > 0) {
    output += "## Search Results (from cache)\n";
    for (const r of grouped.wikipediaSearch) {
      const meta = r.metadata;
      output += `[${meta.article}] ${meta.url}\n`;
      output += `${r.document.slice(0, 200)}...\n\n`;
    }
  }

  // Format pageOverview/pageSection results
  if (grouped.pageOverview.length > 0 || grouped.pageSection.length > 0) {
    output += "## Page Content (from cache)\n";
    for (const r of [...grouped.pageOverview, ...grouped.pageSection]) {
      const meta = r.metadata;
      const sectionNote = meta.section ? ` (section: ${meta.section})` : "";
      output += `**${meta.article}**${sectionNote}\n`;
      output += `Source: ${meta.url}\n`;
      output += `${r.document.slice(0, 300)}...\n\n`;
    }
  }

  return output;
}
