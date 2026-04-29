#!/usr/bin/env node

// src/cli.js
import "dotenv/config";
import readline from "readline";

// system/agents/PromptComposerAgent/graph.mjs
import { StateGraph } from "@langchain/langgraph";

// system/agents/PromptComposerAgent/state.mjs
import { Annotation, messagesStateReducer } from "@langchain/langgraph";
var ComposerState = Annotation.Root({
  messages: Annotation({
    reducer: messagesStateReducer,
    default: () => []
  }),
  combineDone: Annotation({
    reducer: (current, update) => current || update,
    default: () => false
  })
});

// system/agents/llm/api/OpenAICompatible.mjs
import { ChatOpenAI } from "@langchain/openai";
var createModel = ({ baseURL, apiKey, modelId }) => {
  return new ChatOpenAI({
    model: modelId,
    apiKey,
    configuration: {
      baseURL,
      defaultHeaders: {
        "HTTP-Referer": "https://github.com/jinyang6/EVPAgent",
        "X-Title": "EVPAgent"
      }
    }
  });
};

// system/agents/PromptComposerAgent/tools/index.mjs
import { ToolNode } from "@langchain/langgraph/prebuilt";

// system/agents/PromptComposerAgent/tools/read/readSystemPrompt.mjs
import { tool } from "@langchain/core/tools";
import { readFileSync, existsSync } from "fs";
import { join as join2 } from "path";
import z from "zod";

// system/agents/utils/appDataPaths.mjs
import { join } from "path";
import { homedir } from "os";
function getBaseDir() {
  const homeDir = homedir();
  if (process.platform === "win32") {
    return process.env.APPDATA || join(homeDir, ".evpagent");
  }
  if (process.platform === "darwin") {
    return join(homeDir, "Library", "Application Support");
  }
  return process.env.XDG_CONFIG_HOME || join(homeDir, ".config");
}
function getUserPromptsDir() {
  return join(getBaseDir(), "EVPAgent", "prompts", "dynamic_prompts");
}
function getUserConfigDir() {
  return join(getBaseDir(), "EVPAgent", "prompts", "config");
}
function getOutputDir() {
  return join(getBaseDir(), "EVPAgent", "output");
}

// system/agents/PromptComposerAgent/tools/read/readSystemPrompt.mjs
var readSystemPromptTool = tool(
  async () => {
    const configDir = getUserConfigDir();
    const systemPromptPath = join2(configDir, "rover", "rover_system_prompt.md");
    if (!existsSync(systemPromptPath)) {
      return "Error: rover_system_prompt.md not found in config directory";
    }
    return readFileSync(systemPromptPath, "utf-8");
  },
  {
    name: "readSystemPrompt",
    description: "Read the rover system prompt template (rover_system_prompt.md). Returns the full content which contains ${Rephrase} and ${Loop} placeholders.",
    schema: z.object({})
  }
);

// system/agents/PromptComposerAgent/tools/list/listPromptFiles.mjs
import { tool as tool2 } from "@langchain/core/tools";
import { readFileSync as readFileSync2, readdirSync, existsSync as existsSync2 } from "fs";
import { join as join3 } from "path";
import z2 from "zod";
var listPromptFilesTool = tool2(
  async () => {
    const promptsDir = getUserPromptsDir();
    const allFiles = [];
    for (const folder of ["Rephrase", "Loop"]) {
      const folderPath = join3(promptsDir, folder);
      if (!existsSync2(folderPath)) continue;
      const files = readdirSync(folderPath).filter((f) => f.endsWith(".json")).map((f) => {
        try {
          const content = readFileSync2(join3(folderPath, f), "utf-8");
          const parsed = JSON.parse(content);
          return {
            section: folder,
            name: parsed.name || f.replace(".json", ""),
            description: parsed.description || ""
          };
        } catch {
          return { section: folder, name: f.replace(".json", ""), description: "" };
        }
      });
      allFiles.push(...files);
    }
    return JSON.stringify(allFiles);
  },
  {
    name: "listPromptFiles",
    description: "List available prompt files in both Rephrase and Loop folders. Returns JSON array of {section, name, description} objects.",
    schema: z2.object({})
  }
);

// system/agents/PromptComposerAgent/tools/combine/combinePrompts.mjs
import { tool as tool3 } from "@langchain/core/tools";
import { readFileSync as readFileSync3, existsSync as existsSync3, writeFileSync } from "fs";
import { join as join4 } from "path";
import z3 from "zod";
var combinePromptsTool = tool3(
  async ({ prompts, userQuery }) => {
    const promptsDir = getUserPromptsDir();
    const configDir = getUserConfigDir();
    const systemPromptPath = join4(configDir, "rover", "rover_system_prompt.md");
    if (!existsSync3(systemPromptPath)) {
      return "Error: rover_system_prompt.md not found";
    }
    let systemPrompt = readFileSync3(systemPromptPath, "utf-8");
    for (const p of prompts) {
      const filePath = join4(promptsDir, p.section, `${p.promptName}.json`);
      if (existsSync3(filePath)) {
        const content = readFileSync3(filePath, "utf-8");
        const parsed = JSON.parse(content);
        const placeholder = p.section === "Rephrase" ? "${Rephrase}" : "${Loop}";
        systemPrompt = systemPrompt.replace(placeholder, parsed.content || "");
      }
    }
    const dynamicPromptPath = join4(promptsDir, "dynamic_system_prompt.md");
    writeFileSync(dynamicPromptPath, systemPrompt, "utf-8");
    const manifest = {
      userQuery,
      promptsUsed: prompts.map((p) => ({ section: p.section, name: p.promptName })),
      searchHistory: [],
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    const manifestPath = join4(promptsDir, "session_manifest.json");
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
    return `Combined ${prompts.length} prompts. Written to dynamic_system_prompt.md and session_manifest.json`;
  },
  {
    name: "combinePrompts",
    description: "Combine selected prompts into dynamic_system_prompt.md and create session_manifest.json with the combination.",
    schema: z3.object({
      prompts: z3.array(z3.object({
        section: z3.enum(["Rephrase", "Loop"]).describe("Section: Rephrase or Loop"),
        promptName: z3.string().describe("Name of the prompt file (without .json)")
      })).describe("Array of prompts to combine"),
      userQuery: z3.string().describe("The original user query")
    })
  }
);

// system/agents/PromptComposerAgent/tools/index.mjs
var tools = [
  readSystemPromptTool,
  listPromptFilesTool,
  combinePromptsTool
];
var toolNode = new ToolNode(tools);

// system/agents/PromptComposerAgent/agent.mjs
var COMPOSER_SYSTEM_PROMPT = `You are the PromptComposerAgent, responsible for selecting and combining prompt files for a user query.

Your task:
1. Read the base system prompt
2. Call list available prompts for BOTH "Rephrase" folder and "Loop" folder
3. Select prompts for BOTH "Rephrase" folder and "Loop" folder
4. Call combinePrompts with your selection
5. Done

IMPORTANT: 
- MUST follow the above steps
- After calling combinePrompts, simply return a message saying "Done" - do NOT call any more tools.`;
async function callModel(state, config) {
  const messages = state.messages;
  const { baseURL, apiKey, modelId } = config.configurable;
  const provider = createModel({
    baseURL,
    apiKey,
    modelId
  }).bindTools(tools);
  const userQuery = messages.length > 0 ? messages[0].content : "";
  const fullMessages = [
    { role: "system", content: COMPOSER_SYSTEM_PROMPT },
    { role: "user", content: `User query: "${userQuery}"

Please select appropriate prompts and call combinePrompts.` }
  ];
  for (const msg of messages) {
    if (msg.role !== "system") {
      fullMessages.push(msg);
    }
  }
  const response = await provider.invoke(fullMessages);
  return { messages: [response] };
}

// system/agents/PromptComposerAgent/graph.mjs
import { START, END } from "@langchain/langgraph";
var composerGraph = new StateGraph(ComposerState).addNode("agent", callModel).addNode("tools", toolNode).addEdge(START, "agent").addConditionalEdges("agent", (state) => {
  const messages = state.messages;
  const lastMessage = messages[messages.length - 1];
  if (lastMessage?.tool_calls?.length > 0) {
    return "tools";
  }
  return END;
}).addEdge("tools", "agent").compile();

// system/agents/SearchAgent/graph.mjs
import "dotenv/config";
import { StateGraph as StateGraph2 } from "@langchain/langgraph";

// system/agents/SearchAgent/state.mjs
import { Annotation as Annotation2, messagesStateReducer as messagesStateReducer2 } from "@langchain/langgraph";
var AgentState = Annotation2.Root({
  // Chat history
  messages: Annotation2({
    reducer: messagesStateReducer2,
    default: () => []
  })
});

// system/agents/SearchAgent/tools/index.mjs
import path2 from "node:path";
import { ToolNode as ToolNode2 } from "@langchain/langgraph/prebuilt";

// system/agents/SearchAgent/tools/wikipedia/searchWikipedia.mjs
import axios from "axios";
import { tool as tool4 } from "@langchain/core/tools";
import z4 from "zod";
import { readFileSync as readFileSync4, existsSync as existsSync4, writeFileSync as writeFileSync2 } from "fs";
import { join as join5 } from "path";
function reportSearchResult(query, results) {
  try {
    const promptsDir = getUserPromptsDir();
    const manifestPath = join5(promptsDir, "session_manifest.json");
    let manifest = { searchHistory: [], searchSuccess: false };
    if (existsSync4(manifestPath)) {
      try {
        const content = readFileSync4(manifestPath, "utf-8").trim();
        if (content) {
          manifest = JSON.parse(content);
        }
      } catch {
      }
    }
    if (!manifest.searchHistory) manifest.searchHistory = [];
    manifest.searchHistory.push({
      tool: "searchWikipedia",
      arguments: { query, limit: 5 },
      result: results.slice(0, 1e3),
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
    writeFileSync2(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
  } catch (error) {
    console.error("[searchWikipedia] reportSearchResult() failed:", error.message);
  }
}
var wikipediaSearchSchema = z4.object({
  query: z4.string().describe("The search query to find relevant Wikipedia articles"),
  limit: z4.number().optional().default(5).describe("Number of results: 3 for simple facts, 5 for default, 10+ for comprehensive research"),
  type: z4.enum(["text", "nearmatch"]).optional().default("text").describe("Type of search: text (full text) or nearmatch")
});
async function wikipediaSearch({ query, limit = 5, type = "text" }) {
  const params = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: query,
    srnamespace: "0",
    srlimit: String(limit),
    srwhat: type,
    srprop: "size|wordcount|timestamp|snippet|titlesnippet",
    format: "json",
    utf8: "1"
  });
  const url = `http://en.wikipedia.org/w/api.php?${params.toString()}`;
  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent": "EVPAgent/1.0 (https://github.com/jinyang6/EVPAgent; jiatom519@gmail.com)"
      },
      timeout: 15e3
    });
    const queryData = response.data?.query;
    if (!queryData?.search || queryData.search.length === 0) {
      return `Wikipedia search for "${query}" returned no results.`;
    }
    const searchInfo = queryData.searchinfo || {};
    const totalHits = searchInfo.totalhits || queryData.search.length;
    let output = `Wikipedia Search Results for "${query}":

`;
    queryData.search.forEach((item, index) => {
      const articleUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, "_"))}`;
      const snippet = item.snippet?.replace(/<[^>]*>/g, "") || "No preview available";
      output += `[${index + 1}] ${item.title}
`;
      output += `${articleUrl}
`;
      output += `${snippet}

`;
    });
    reportSearchResult(query, output);
    return output.trim();
  } catch (error) {
    if (error.response?.status === 429) {
      return `Wikipedia search rate limited. Please wait and try again.`;
    }
    return `Wikipedia search for "${query}" failed: ${error.message}`;
  }
}
var searchWikipediaTool = tool4(
  wikipediaSearch,
  {
    name: "searchWikipedia",
    description: `Search Wikipedia for articles using MediaWiki Action API.

Parameters:
- query (required): Search query - supports advanced operators:
  - "exact phrase" for exact match
  - AND / OR / NOT for boolean logic (e.g., "Mars AND ocean NOT atmosphere")
  - intitle: for title-only search (e.g., intitle:"Curiosity rover")
  - insource: for article text search (e.g., insource:"olivine" "water")
  - incategory: for category search (e.g., incategory:"Space exploration")
- limit (optional, default=5): Number of results (3=facts, 5=default, 10+=research)
- type (optional): 'text' or 'nearmatch'

Returns: Page titles, URLs, snippets.`,
    schema: wikipediaSearchSchema
  }
);

// system/agents/SearchAgent/tools/wikipedia/fetchWikiPage.mjs
import axios3 from "axios";
import { tool as tool5 } from "@langchain/core/tools";
import z5 from "zod";
import * as cheerio from "cheerio";
import TurndownService from "turndown";
import { readFileSync as readFileSync5, existsSync as existsSync5, writeFileSync as writeFileSync3 } from "fs";
import { join as join6 } from "path";

// system/agents/SearchAgent/tools/vector/vectorHelpers.mjs
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import axios2 from "axios";
import { connect } from "@lancedb/lancedb";
import { OpenAIEmbeddings } from "@langchain/openai";
var TABLE_NAME = "evpagent_wikipedia";
var USER_AGENT = "EVPAgent/1.0 (https://github.com/jinyang6/EVPAgent; jiatom519@gmail.com)";
function getVectorDBPath() {
  const homeDir = os.homedir();
  if (process.platform === "win32") {
    return process.env.APPDATA ? path.join(process.env.APPDATA, "EVPAgent", "lancedb") : path.join(homeDir, ".evpagent", "lancedb");
  }
  if (process.platform === "darwin") {
    return path.join(homeDir, "Library", "Application Support", "EVPAgent", "lancedb");
  }
  return process.env.XDG_CONFIG_HOME ? path.join(process.env.XDG_CONFIG_HOME, "evpagent", "lancedb") : path.join(homeDir, ".config", "evpagent", "lancedb");
}
var embeddingsInstance = null;
function getEmbeddings() {
  if (!embeddingsInstance) {
    embeddingsInstance = new OpenAIEmbeddings({
      model: process.env.EMBEDDING_MODEL_ID,
      apiKey: process.env.EMBEDDING_MODEL_API_KEY,
      configuration: {
        baseURL: process.env.EMBEDDING_MODEL_BASE_URL
      }
    });
  }
  return embeddingsInstance;
}
var db = null;
var table = null;
async function getTable() {
  if (!table) {
    const dbPath = getVectorDBPath();
    db = await connect(dbPath);
    try {
      table = await db.openTable(TABLE_NAME);
    } catch (error) {
      const embeddings = getEmbeddings();
      const placeholderVector = await embeddings.embedQuery("__init__");
      table = await db.createTable(TABLE_NAME, [
        {
          id: "__init__",
          vector: placeholderVector,
          text: "__placeholder__",
          type: "placeholder",
          article: "",
          section: "",
          url: "",
          lastEdited: (/* @__PURE__ */ new Date()).toISOString()
        }
      ]);
    }
  }
  return table;
}
async function resetVectorDB() {
  const { rmSync, existsSync: existsSync16 } = await import("fs");
  const dbPath = getVectorDBPath();
  if (existsSync16(dbPath)) {
    rmSync(dbPath, { recursive: true, force: true });
  }
  db = null;
  table = null;
}
function generateDocId(type, article, section, url) {
  const raw = `${type}-${article}-${section}-${url}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}
async function getLastEditedTime(pageTitle) {
  try {
    const params = new URLSearchParams({
      action: "query",
      titles: pageTitle,
      prop: "revisions",
      rvlimit: "1",
      rvprop: "timestamp",
      format: "json",
      utf8: "1"
    });
    const url = `https://en.wikipedia.org/w/api.php?${params.toString()}`;
    const response = await axios2.get(url, {
      headers: { "User-Agent": USER_AGENT },
      timeout: 1e4
    });
    const pages = response.data?.query?.pages || {};
    const page = Object.values(pages)[0];
    if (page?.revisions?.[0]?.timestamp) {
      return page.revisions[0].timestamp;
    }
    return (/* @__PURE__ */ new Date()).toISOString();
  } catch (error) {
    console.error(`[VectorDB] getLastEditedTime() failed for ${pageTitle}:`, error.message);
    return (/* @__PURE__ */ new Date()).toISOString();
  }
}
function buildWikiUrl(article, section = null) {
  const encodedTitle = encodeURIComponent(article.replace(/ /g, "_"));
  if (section) {
    const encodedSection = encodeURIComponent(section.replace(/ /g, "_"));
    return `https://en.wikipedia.org/wiki/${encodedTitle}#${encodedSection}`;
  }
  return `https://en.wikipedia.org/wiki/${encodedTitle}`;
}
async function searchVectorDB(query, k = 3, filterType) {
  if (!filterType) {
    throw new Error("filterType is required for searchVectorDB");
  }
  try {
    const tbl = await getTable();
    const embeddings = getEmbeddings();
    const queryEmbedding = await embeddings.embedQuery(query);
    const results = await tbl.search(queryEmbedding).limit(k * 2).toArray();
    const formattedResults = results.filter((row) => row.type === filterType).slice(0, k).map((row) => ({
      id: row.id,
      document: row.text,
      metadata: {
        type: row.type,
        article: row.article,
        section: row.section,
        url: row.url,
        lastEdited: row.lastEdited
      },
      distance: row._distance
    }));
    return formattedResults;
  } catch (error) {
    console.error(`[VectorDB] searchVectorDB() failed: ${error.message}. Falling back to web search.`);
    return [];
  }
}
async function upsertWikiPage(page, section, content) {
  try {
    const tbl = await getTable();
    const embeddings = getEmbeddings();
    const url = buildWikiUrl(page, section);
    const lastEdited = await getLastEditedTime(page);
    const id = generateDocId(
      section ? "pageSection" : "pageOverview",
      page,
      section || "",
      url
    );
    const vector = await embeddings.embedQuery(content);
    await tbl.add([{
      id,
      vector,
      text: content,
      type: section ? "pageSection" : "pageOverview",
      article: page,
      section: section || "",
      url,
      lastEdited
    }]);
  } catch (error) {
    console.error(`[VectorDB] upsertWikiPage() failed: ${error.message}`);
  }
}

// system/agents/SearchAgent/tools/stats.mjs
var stats = {
  vectorHits: 0,
  webRequests: 0,
  responseCount: 0
};
function recordVectorHit(type = "unknown") {
  stats.vectorHits++;
}
function recordWebRequest(type = "unknown") {
  stats.webRequests++;
}
function recordArticle(article) {
}
function getStats() {
  return { ...stats };
}
function resetResponseStats() {
  stats.responseCount++;
  stats.vectorHits = 0;
  stats.webRequests = 0;
}

// system/agents/SearchAgent/tools/wikipedia/fetchWikiPage.mjs
function reportFetchResult(page, section, content) {
  try {
    const promptsDir = getUserPromptsDir();
    const manifestPath = join6(promptsDir, "session_manifest.json");
    let manifest = { searchHistory: [], searchSuccess: false };
    if (existsSync5(manifestPath)) {
      manifest = JSON.parse(readFileSync5(manifestPath, "utf-8"));
    }
    if (!manifest.searchHistory) manifest.searchHistory = [];
    manifest.searchHistory.push({
      tool: "fetchWikiPage",
      arguments: { page, section: section || null },
      result: content.slice(0, 1e3),
      // Truncate for storage
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
    writeFileSync3(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
  } catch (error) {
    console.error("[fetchWikiPage] reportFetchResult() failed:", error.message);
  }
}
var wikiPageSchema = z5.object({
  page: z5.string().describe('Wikipedia page title (e.g., "Mars")'),
  section: z5.string().optional().describe('Section anchor to fetch (e.g., "Formation", omit for overview)'),
  limit: z5.number().optional().default(3).describe("Vector cache top-k for semantic search"),
  useCache: z5.boolean().optional().default(true).describe("Whether to use vector cache for retrieval")
});
function decodeHtmlEntities(str) {
  return str.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10))).replace(/&#x([a-fA-F0-9]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16))).replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}
function htmlToMarkdown(html, pageTitle = "") {
  const $ = cheerio.load(html);
  const turndown = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced"
  });
  const citations = /* @__PURE__ */ new Map();
  let idx = 1;
  $("ol.references li").each((_, el) => {
    const $el = $(el);
    const text = $el.text().trim().replace(/^\[\d+\]\s*/, "");
    if (text.includes("Cite error")) return;
    const id = decodeHtmlEntities($el.attr("id") || "");
    const url = $el.find("a.external").attr("href") || "";
    citations.set(id, { index: idx++, text: text.slice(0, 150), url });
  });
  $("sup.reference, sup.citation").each((_, el) => {
    const $el = $(el);
    const href = decodeHtmlEntities($el.find("a").attr("href") || "");
    const match = href.match(/#(cite_note-[^"]+)/);
    const citeId = match && [...citations.keys()].find((k) => k.includes(match[1]));
    const citation = citeId && citations.get(citeId);
    if (citation) {
      if (citation.url) {
        $el.replaceWith(`[${citation.index}](${citation.url})`);
      } else {
        const citeUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(pageTitle)}#${citeId}`;
        $el.replaceWith(`[${citation.index}](${citeUrl})`);
      }
    } else {
      const text = $el.text().replace(/[\[\]]/g, "").trim();
      if (text) {
        $el.replaceWith(`[${text}]`);
      } else {
        $el.remove();
      }
    }
  });
  $("a[href^='/wiki/']").each((_, el) => {
    let href = $(el).attr("href");
    try {
      href = decodeURIComponent(href);
    } catch {
    }
    $(el).attr("href", `https://en.wikipedia.org${href}`);
  });
  $(".mw-editsection, .mw-editsection-bracket, .references, ol.references, .mw-references-wrap").remove();
  $(".side-box, .infobox, .navbox, .metadata, .thumb, .multiimage, .tmulti, table.mw-wiki").remove();
  $("style[data-mw-deduplicate], style").remove();
  $("[class*='Cite'], [class*='error']").remove();
  return turndown.turndown($.html()).replace(/\\\[(\d+)\\\]/g, "[$1]").replace(/\\\(/g, "(").replace(/\\\)/g, ")").replace(/\\_/g, "_");
}
function extractLeadHtml(html) {
  const $ = cheerio.load(html);
  $(".shortdescription, .mw-empty-elt, figure, style, .mw-editsection").remove();
  const container = $(".mw-parser-output");
  if (!container.length) {
    return "";
  }
  let leadHtml = "";
  let reachedSection = false;
  container.children().each((_, el) => {
    const $el = $(el);
    if ($el.is("h2") || $el.find("h2").length > 0 || $el.is("meta[property='mw:PageProp/toc']")) {
      reachedSection = true;
      return false;
    }
    if ($el.is(".references, .mw-references-wrap, .catlinks, .printfooter")) {
      return;
    }
    leadHtml += $.html(el) + "\n";
  });
  return `<div class="mw-parser-output">
${leadHtml}</div>`;
}
function normalizeTitle(title) {
  if (!title) return "";
  return title.toLowerCase().replace(/_/g, " ").replace(/%([a-f0-9]{2})/gi, (_, p) => String.fromCharCode(parseInt(p, 16))).replace(/[?!.,;:]/g, "").trim();
}
function titleSimilarity(a, b) {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const wordsA = new Set(a.split(/\s+/));
  const wordsB = new Set(b.split(/\s+/));
  const intersection = new Set([...wordsA].filter((x) => wordsB.has(x)));
  const union = /* @__PURE__ */ new Set([...wordsA, ...wordsB]);
  return intersection.size / union.size;
}
function titlesMatch(title1, title2, threshold = 0.8) {
  return titleSimilarity(normalizeTitle(title1), normalizeTitle(title2)) >= threshold;
}
async function fetchWikiPage({ page, section, limit = 3, useCache = true }) {
  if (useCache) {
    const filterType = section !== void 0 ? "pageSection" : "pageOverview";
    const searchQuery = section !== void 0 ? `${page} ${section}` : page;
    try {
      const cachedResults = await searchVectorDB(searchQuery, limit, filterType);
      if (cachedResults && cachedResults.length > 0) {
        const matching = cachedResults.find(
          (r) => titlesMatch(r.metadata?.article, page) && titlesMatch(r.metadata?.section, section)
        );
        if (matching) {
          recordVectorHit(section ? "section" : "page");
          recordArticle(page);
          const content = `[Cache hit]

${matching.document}

_Cache hit - retrieved from local vector database_`;
          reportFetchResult(page, section, content);
          return content;
        }
      }
    } catch (error) {
      console.error("[fetchWikiPage] cache lookup failed:", error.message);
    }
  }
  try {
    const baseUrl = "https://en.wikipedia.org/w/api.php";
    const userAgent = "EVPAgent/1.0 (https://github.com/jinyang6/EVPAgent; jiatom519@gmail.com)";
    const pageUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(page.replace(/ /g, "_"))}`;
    const params = {
      action: "parse",
      page,
      prop: "text|tocdata",
      format: "json"
    };
    const response = await axios3.get(baseUrl, {
      params,
      headers: { "User-Agent": userAgent },
      timeout: 15e3
    });
    const data = response.data;
    if (!data?.parse) {
      return `Wikipedia page "${page}" not found.`;
    }
    const html = data.parse.text?.["*"] || "";
    const sectionsData = data.parse.tocdata?.sections || [];
    const pageTitle = data.parse.title || page;
    if (section !== void 0) {
      const sectionData = sectionsData.find(
        (s) => s.line === section || s.anchor === section.replace(/ /g, "_")
      );
      if (!sectionData) {
        return `Section "${section}" not found on page "${pageTitle}".`;
      }
      const sectionIndex = parseInt(sectionData.index, 10);
      const sectionAnchor = sectionData.anchor || section.replace(/ /g, "_");
      const sectionUrl = `${pageUrl}#${sectionAnchor}`;
      const sectionParams = {
        action: "parse",
        page,
        section: sectionIndex,
        prop: "text",
        format: "json"
      };
      const sectionResponse = await axios3.get(baseUrl, {
        params: sectionParams,
        headers: { "User-Agent": userAgent },
        timeout: 15e3
      });
      const sectionHtml = sectionResponse.data?.parse?.text?.["*"] || "";
      const markdown = htmlToMarkdown(sectionHtml, pageTitle);
      const content = `# ${pageTitle} - ${section}
**Source:** ${sectionUrl}

${markdown}`;
      recordWebRequest("section");
      recordArticle(page);
      upsertWikiPage(page, section, markdown).catch((error) => {
        console.error("[fetchWikiPage] fetchWikiPage() failed to cache section:", error.message);
      });
      reportFetchResult(page, section, content);
      return content;
    }
    const leadHtml = extractLeadHtml(html);
    const $full = cheerio.load(html);
    const referencesHtml = $full("ol.references").html() || "";
    const combinedHtml = leadHtml.replace("</div>", `<ol class="references">${referencesHtml}</ol></div>`);
    const leadMarkdown = htmlToMarkdown(combinedHtml, pageTitle);
    let result = `# ${pageTitle}
**Source:** ${pageUrl}

`;
    result += `## Overview
${leadMarkdown}

`;
    result += `## Sections (${sectionsData.length})
`;
    if (sectionsData.length > 0) {
      sectionsData.forEach((s) => {
        result += `- [${s.line}] ${s.anchor ? `(anchor: ${s.anchor})` : ""}
`;
      });
    } else {
      result += `No sections found.
`;
    }
    result += `
---

**Full section available - ask to fetch specific sections by anchor.**`;
    recordWebRequest("page");
    recordArticle(page);
    upsertWikiPage(page, "", result).catch((error) => {
      console.error("[fetchWikiPage] fetchWikiPage() failed to cache overview:", error.message);
    });
    reportFetchResult(page, null, result);
    return result;
  } catch (error) {
    if (error.response?.status === 404) {
      return `Wikipedia page "${page}" not found.`;
    }
    return `Error fetching Wikipedia page: ${error.message}`;
  }
}
var fetchWikiPageTool = tool5(
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
    schema: wikiPageSchema
  }
);

// system/agents/SearchAgent/tools/postprocess/reportTool.mjs
import { tool as tool6 } from "@langchain/core/tools";
import { readFileSync as readFileSync6, existsSync as existsSync6, writeFileSync as writeFileSync4, mkdirSync } from "fs";
import { join as join7 } from "path";
import z6 from "zod";
function getOutputFile() {
  return join7(getOutputDir(), "output.md");
}
var reportTool = tool6(
  async ({ searchSuccess, response }) => {
    const promptsDir = getUserPromptsDir();
    const manifestPath = join7(promptsDir, "session_manifest.json");
    if (response) {
      const outputDir = getOutputDir();
      const outputFile = getOutputFile();
      if (!existsSync6(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }
      writeFileSync4(outputFile, response, "utf-8");
    }
    if (!existsSync6(manifestPath)) {
      return "Error: session_manifest.json not found";
    }
    try {
      const manifest = JSON.parse(readFileSync6(manifestPath, "utf-8"));
      manifest.searchSuccess = searchSuccess;
      manifest.timestamp = (/* @__PURE__ */ new Date()).toISOString();
      writeFileSync4(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
    } catch (error) {
      return `Error: ${error.message}`;
    }
  },
  {
    name: "report",
    description: "Report search success status and optionally save final response to output.md.",
    schema: z6.object({
      searchSuccess: z6.boolean().describe("Whether the search was successful"),
      response: z6.string().optional().describe("Final response to save to output.md")
    })
  }
);

// system/agents/SearchAgent/tools/index.mjs
var tools2 = [
  searchWikipediaTool,
  fetchWikiPageTool,
  reportTool
];
var toolNode2 = new ToolNode2(tools2);

// system/agents/SearchAgent/agent.mjs
async function callModel2(state, config) {
  const messages = state.messages;
  const { baseURL, apiKey, modelId, systemPrompt } = config.configurable;
  const fullMessages = [
    { role: "system", content: systemPrompt || "You are EVPAgent." },
    ...messages
  ];
  const provider = createModel({
    baseURL,
    apiKey,
    modelId
  }).bindTools(tools2);
  const response = await provider.invoke(fullMessages);
  return { messages: [response] };
}

// system/agents/SearchAgent/graph.mjs
import { START as START2, END as END2 } from "@langchain/langgraph";
var searchGraph = new StateGraph2(AgentState).addNode("agent", callModel2).addNode("tools", toolNode2).addEdge(START2, "agent").addConditionalEdges("agent", (state) => {
  const messages = state.messages;
  const lastMessage = messages[messages.length - 1];
  const toolCalls = "tool_calls" in lastMessage ? lastMessage.tool_calls : [];
  if (toolCalls.length > 0) {
    return "tools";
  }
  return END2;
}).addEdge("tools", "agent").compile();

// system/agents/PromptRefineAgent/graph.mjs
import { StateGraph as StateGraph3 } from "@langchain/langgraph";

// system/agents/PromptRefineAgent/state.mjs
import { Annotation as Annotation3, messagesStateReducer as messagesStateReducer3 } from "@langchain/langgraph";
var RefineState = Annotation3.Root({
  messages: Annotation3({
    reducer: messagesStateReducer3,
    default: () => []
  })
});

// system/agents/PromptRefineAgent/tools/index.mjs
import { ToolNode as ToolNode3 } from "@langchain/langgraph/prebuilt";

// system/agents/PromptRefineAgent/tools/read/readSessionManifest.mjs
import { tool as tool7 } from "@langchain/core/tools";
import { readFileSync as readFileSync7, existsSync as existsSync7 } from "fs";
import { join as join8 } from "path";
import z7 from "zod";
var readSessionManifestTool = tool7(
  async () => {
    const promptsDir = getUserPromptsDir();
    const manifestPath = join8(promptsDir, "session_manifest.json");
    if (!existsSync7(manifestPath)) {
      return JSON.stringify({ error: "session_manifest.json not found" });
    }
    return readFileSync7(manifestPath, "utf-8");
  },
  {
    name: "readSessionManifest",
    description: "Read the current session manifest containing user query, prompts used, and search history.",
    schema: z7.object({})
  }
);

// system/agents/PromptRefineAgent/tools/read/readSystemPrompt.mjs
import { tool as tool8 } from "@langchain/core/tools";
import { readFileSync as readFileSync8, existsSync as existsSync8 } from "fs";
import { join as join9 } from "path";
import z8 from "zod";
var readSystemPromptTool2 = tool8(
  async ({}) => {
    const configDir = getUserConfigDir();
    const filePath = join9(configDir, "rover", "rover_system_prompt.md");
    if (!existsSync8(filePath)) {
      return JSON.stringify({ error: `System prompt not found at ${filePath}` });
    }
    return readFileSync8(filePath, "utf-8");
  },
  {
    name: "readSystemPrompt",
    description: "Read the main system prompt (rover_system_prompt.md) content. This is the primary prompt that guides rover mode search behavior.",
    schema: z8.object({})
  }
);

// system/agents/PromptRefineAgent/tools/list/listPromptFiles.mjs
import { tool as tool9 } from "@langchain/core/tools";
import { readFileSync as readFileSync9, readdirSync as readdirSync2, existsSync as existsSync9 } from "fs";
import { join as join10 } from "path";
import z9 from "zod";
var listPromptFilesTool2 = tool9(
  async ({ folder }) => {
    const promptsDir = getUserPromptsDir();
    const folderPath = join10(promptsDir, folder);
    if (!existsSync9(folderPath)) {
      return JSON.stringify([]);
    }
    const files = readdirSync2(folderPath).filter((f) => f.endsWith(".json")).map((f) => {
      try {
        const content = readFileSync9(join10(folderPath, f), "utf-8");
        const parsed = JSON.parse(content);
        return {
          name: parsed.name || f.replace(".json", ""),
          description: parsed.description || ""
        };
      } catch {
        return { name: f.replace(".json", ""), description: "" };
      }
    });
    return JSON.stringify(files);
  },
  {
    name: "listPromptFiles",
    description: "List available prompt files in a folder. Returns JSON array of {name, description} objects.",
    schema: z9.object({
      folder: z9.enum(["Rephrase", "Loop"]).describe("Folder to list: Rephrase or Loop")
    })
  }
);

// system/agents/PromptRefineAgent/tools/read/readPrompt.mjs
import { tool as tool10 } from "@langchain/core/tools";
import { readFileSync as readFileSync10, existsSync as existsSync10 } from "fs";
import { join as join11 } from "path";
import z10 from "zod";
var readPromptTool = tool10(
  async ({ prompt }) => {
    const promptsDir = getUserPromptsDir();
    const filePath = join11(promptsDir, prompt.section, `${prompt.promptName}.json`);
    if (!existsSync10(filePath)) {
      return JSON.stringify({ error: `Prompt ${prompt.promptName} not found in ${prompt.section}` });
    }
    return readFileSync10(filePath, "utf-8");
  },
  {
    name: "readPrompt",
    description: "Read a specific prompt file by section and name. Returns full JSON with name, description, and content.",
    schema: z10.object({
      prompt: z10.object({
        section: z10.enum(["Rephrase", "Loop"]).describe("Section folder: Rephrase or Loop"),
        promptName: z10.string().describe("Name of the prompt file (without .json)")
      })
    })
  }
);

// system/agents/PromptRefineAgent/tools/write/writePrompt.mjs
import { tool as tool11 } from "@langchain/core/tools";
import { readFileSync as readFileSync11, existsSync as existsSync11, writeFileSync as writeFileSync5 } from "fs";
import { join as join12 } from "path";
import z11 from "zod";
var writePromptTool = tool11(
  async ({ prompt }) => {
    const promptsDir = getUserPromptsDir();
    const folderPath = join12(promptsDir, prompt.section);
    if (!existsSync11(folderPath)) {
      return JSON.stringify({ error: `Folder ${prompt.section} does not exist` });
    }
    const filePath = join12(folderPath, `${prompt.promptName}.json`);
    const promptData = {
      name: prompt.promptName,
      description: prompt.description,
      content: prompt.content
    };
    writeFileSync5(filePath, JSON.stringify(promptData, null, 2), "utf-8");
    return `Written prompt ${prompt.promptName} to ${prompt.section} folder`;
  },
  {
    name: "writePrompt",
    description: "Write or update a prompt file with name, description, and content.",
    schema: z11.object({
      prompt: z11.object({
        section: z11.enum(["Rephrase", "Loop"]).describe("Section folder: Rephrase or Loop"),
        promptName: z11.string().describe("Name for the prompt file (without .json)"),
        description: z11.string().describe("Brief description of when to use this prompt"),
        content: z11.string().describe("The markdown content of the prompt")
      })
    })
  }
);

// system/agents/PromptRefineAgent/tools/delete/deletePrompt.mjs
import { tool as tool12 } from "@langchain/core/tools";
import { readFileSync as readFileSync12, existsSync as existsSync12, unlinkSync } from "fs";
import { join as join13 } from "path";
import z12 from "zod";
var deletePromptTool = tool12(
  async ({ prompt }) => {
    const promptsDir = getUserPromptsDir();
    const filePath = join13(promptsDir, prompt.section, `${prompt.promptName}.json`);
    if (!existsSync12(filePath)) {
      return `Prompt ${prompt.promptName} not found in ${prompt.section}`;
    }
    if (prompt.promptName === "default") {
      return "Cannot delete the default prompt";
    }
    unlinkSync(filePath);
    return `Deleted prompt ${prompt.promptName} from ${prompt.section} folder`;
  },
  {
    name: "deletePrompt",
    description: "Delete a prompt file from a section folder.",
    schema: z12.object({
      prompt: z12.object({
        section: z12.enum(["Rephrase", "Loop"]).describe("Section folder: Rephrase or Loop"),
        promptName: z12.string().describe("Name of the prompt file to delete (without .json)")
      })
    })
  }
);

// system/agents/PromptRefineAgent/tools/index.mjs
var tools3 = [
  readSessionManifestTool,
  readSystemPromptTool2,
  listPromptFilesTool2,
  readPromptTool,
  writePromptTool,
  deletePromptTool
];
var toolNode3 = new ToolNode3(tools3);

// system/agents/PromptRefineAgent/agent.mjs
var REFINE_SYSTEM_PROMPT = `You are the PromptRefineAgent, responsible for analyzing search sessions and optimizing prompt files to lower search cost and increase answer quality.

Your task:
1. Read session_manifest.json to understand the current session (query, prompts used, search history, outcomes)
2. Check if "searchSuccess" is true or false in the manifest
3. If searchSuccess is FALSE: Do nothing. Return immediately without calling any tools or making any changes.
4. If searchSuccess is TRUE: Continue with analysis and prompt optimization below.

CRITICAL: If the manifest shows searchSuccess is false, do NOT call any tools, do NOT analyze prompts, do NOT make any changes. Simply end your turn without response.

Only proceed with the following if searchSuccess is TRUE:
5. Read the prompt files that were used (Rephrase.md, Loop.md, rover_system_prompt.md) to understand their content
6. Analyze whether the prompts were effective for the query
7. Decide to: update existing prompts, create new ones, or delete redundant ones

Goals:
- LOWER SEARCH COST: Reduce unnecessary tool calls, redundant searches, and inefficient patterns
- INCREASE SUCCESS RATE: Help future searches find more relevant Wikipedia content faster
- IMPROVE ANSWER QUALITY: Get more comprehensive, accurate answers from Wikipedia

Analysis criteria:
- Was the search history productive? (good tool calls, relevant results, no redundant loops)
- Were the selected prompts appropriate for the query complexity?
- Was the search plan efficient? Could fewer searches have achieved the same result?
- Did the rephrasing/derivation strategy work well?
- Were search terms optimal for finding relevant Wikipedia articles?
- Did the agent get stuck in loops or make unnecessary calls?
- Could improving prompts (Rephrase, Loop) make ALL future searches better?
- Should add new prompts (Rephrase, Loop) make generic topic searches better?

After finishing your analysis and any prompt changes, simply end your turn. Do NOT call any more tools.`;
async function callModel3(state, config) {
  const { baseURL, apiKey, modelId } = config.configurable;
  const messages = state.messages;
  const provider = createModel({
    baseURL,
    apiKey,
    modelId
  }).bindTools(tools3);
  const fullMessages = [
    { role: "system", content: REFINE_SYSTEM_PROMPT },
    ...messages
    // Include full chat history
  ];
  const response = await provider.invoke(fullMessages);
  return { messages: [response] };
}

// system/agents/PromptRefineAgent/graph.mjs
import { START as START3, END as END3 } from "@langchain/langgraph";
var refineGraph = new StateGraph3(RefineState).addNode("agent", callModel3).addNode("tools", toolNode3).addEdge(START3, "agent").addConditionalEdges("agent", (state) => {
  const messages = state.messages;
  const lastMessage = messages[messages.length - 1];
  const toolCalls = "tool_calls" in lastMessage ? lastMessage.tool_calls : [];
  if (toolCalls.length > 0) {
    return "tools";
  }
  return END3;
}).addEdge("tools", "agent").compile();

// system/agents/SysAgent/utils/paths.mjs
import { join as join14, dirname } from "path";
import { homedir as homedir2 } from "os";
import { fileURLToPath } from "url";
import { existsSync as existsSync13 } from "fs";
function getBaseDir2() {
  const homeDir = homedir2();
  if (process.platform === "win32") {
    return process.env.APPDATA || join14(homeDir, ".evpagent");
  }
  if (process.platform === "darwin") {
    return join14(homeDir, "Library", "Application Support");
  }
  return process.env.XDG_CONFIG_HOME || join14(homeDir, ".config");
}
function getPromptsDir() {
  return join14(getBaseDir2(), "EVPAgent", "prompts", "dynamic_prompts");
}
function getConfigDir() {
  return join14(getBaseDir2(), "EVPAgent", "prompts", "config");
}
function getScriptDir() {
  const entryDir = dirname(fileURLToPath(import.meta.url));
  const possiblePaths = [
    // Bundled npm: node_modules/evpagent/prompts/
    join14(entryDir, "..", "..", "..", "..", "prompts"),
    // Built dist: EVPAgent/src/dist/prompts/
    join14(entryDir, "..", "..", "system", "prompts"),
    // Development source: EVPAgent/system/prompts/
    join14(entryDir, "..", "..", "..", "..", "system", "prompts")
  ];
  for (const p of possiblePaths) {
    if (existsSync13(p)) {
      return p;
    }
  }
  return possiblePaths[0];
}

// system/agents/SysAgent/utils/files.mjs
import { existsSync as existsSync14, readFileSync as readFileSync13 } from "fs";
function readJson(path3) {
  if (!existsSync14(path3)) return null;
  try {
    return JSON.parse(readFileSync13(path3, "utf-8"));
  } catch {
    return null;
  }
}
function readFile(path3) {
  if (!existsSync14(path3)) return null;
  const content = readFileSync13(path3, "utf-8");
  return content.trim() || null;
}

// system/agents/SysAgent/types/chunk.mjs
var toolCounter = 0;
function textChunk(content, index = 0) {
  return {
    choices: [{ delta: { content }, index }]
  };
}
function toolChunk(name, args = {}, index = 0) {
  return {
    choices: [{
      delta: {
        tool_calls: [{
          id: `tool_${++toolCounter}`,
          name,
          args
        }]
      },
      index
    }]
  };
}
function isNonEmptyString(val) {
  return typeof val === "string" && val.length > 0;
}

// system/agents/SysAgent/index.mjs
import { existsSync as existsSync15, cpSync, mkdirSync as mkdirSync2, readdirSync as readdirSync3, unlinkSync as unlinkSync2, writeFileSync as writeFileSync6 } from "fs";
import { join as join15 } from "path";
var SysAgent = class {
  // ─────────────────────────────────────────────────────────────────────────────
  // Constructor & Config
  // ─────────────────────────────────────────────────────────────────────────────
  /**
   * Create a new SysAgent instance
   * @param {Object} config - Configuration options
   * @param {string} config.baseURL - LLM base URL
   * @param {string} config.apiKey - LLM API key
   * @param {string} config.modelId - LLM model ID
   */
  constructor(config = {}) {
    this.baseConfig = {
      configurable: {
        baseURL: config.baseURL || process.env.SEARCH_MODEL_BASE_URL,
        apiKey: config.apiKey || process.env.SEARCH_MODEL_API_KEY,
        modelId: config.modelId || process.env.SEARCH_MODEL_ID
      },
      recursionLimit: 100
    };
    this._initialized = false;
  }
  // ─────────────────────────────────────────────────────────────────────────────
  // Public API - Entry Points
  // ─────────────────────────────────────────────────────────────────────────────
  /**
   * Stream results as async generator
   * @param {string} userQuery - The query to search
   * @param {'probe'|'rover'} mode - Workflow mode: probe (fast) or rover (in-depth)
   */
  async *stream(userQuery, mode = "probe") {
    if (!this._initialized) await this.init();
    this.#resetSessionFiles();
    if (mode === "probe") {
      yield* this.#searchWithPrompt(userQuery, this.#getProbePrompt());
    } else {
      yield* this.#compose(userQuery);
      yield* this.#searchWithPrompt(userQuery, this.#getRoverPrompt());
      yield* this.#refine();
    }
  }
  /**
   * Collect all chunks into array and return
   * @param {string} userQuery - The query to search
   * @param {'probe'|'rover'} mode - Workflow mode
   * @returns {Promise<Array>} Array of chunks
   */
  async invoke(userQuery, mode = "probe") {
    const chunks = [];
    for await (const chunk of this.stream(userQuery, mode)) {
      chunks.push(chunk);
    }
    return chunks;
  }
  /**
   * Get cache statistics (vector hits, web requests, etc.)
   * @returns {Object} Stats object
   */
  getStats() {
    return getStats();
  }
  /**
   * Reset response statistics to zero
   */
  resetStats() {
    resetResponseStats();
  }
  /**
   * Delete all data in the vector database (LanceDB)
   * This clears all cached Wikipedia content
   */
  async resetVectorDB() {
    await resetVectorDB();
  }
  /**
   * Reset dynamic prompt files to default versions
   * Removes user-modified Rephrase.json and Loop.json
   */
  resetPrompts() {
    const promptsDir = getPromptsDir();
    for (const subdir of ["Loop", "Rephrase"]) {
      const dir = join15(promptsDir, subdir);
      if (!existsSync15(dir)) continue;
      for (const file of readdirSync3(dir)) {
        if (file.endsWith(".json")) {
          unlinkSync2(join15(dir, file));
        }
      }
    }
  }
  // ─────────────────────────────────────────────────────────────────────────────
  // Initialization
  // ─────────────────────────────────────────────────────────────────────────────
  /**
   * Initialize agent: ensure all config and prompt files exist in user directory
   * Copies default files from dist if they don't exist
   */
  async init() {
    if (this._initialized) return;
    this._ensureConfigFiles();
    this._ensurePromptFiles();
    this._initialized = true;
  }
  /**
   * Ensure config prompt files exist in user directory
   * Copies from system/prompts/config/rover and /probe if missing
   */
  _ensureConfigFiles() {
    const userDir = getConfigDir();
    const distDir = join15(getScriptDir(), "config");
    if (!existsSync15(userDir)) {
      mkdirSync2(userDir, { recursive: true });
    }
    const roverSrc = join15(distDir, "rover");
    const roverDest = join15(userDir, "rover");
    if (!existsSync15(roverDest)) mkdirSync2(roverDest, { recursive: true });
    for (const file of ["rover_system_prompt.md", "Loop.md", "Rephrase.md"]) {
      const src = join15(roverSrc, file);
      const dest = join15(roverDest, file);
      if (existsSync15(src)) cpSync(src, dest, { force: true });
    }
    const probeSrc = join15(distDir, "probe");
    const probeDest = join15(userDir, "probe");
    if (!existsSync15(probeDest)) mkdirSync2(probeDest, { recursive: true });
    for (const file of ["probe_system_prompt.md"]) {
      const src = join15(probeSrc, file);
      const dest = join15(probeDest, file);
      if (existsSync15(src)) cpSync(src, dest, { force: true });
    }
  }
  /**
   * Ensure dynamic prompt subdirectories exist and copy defaults
   * Creates Loop/ and Rephrase/ subdirectories in user prompts dir
   */
  _ensurePromptFiles() {
    const userDir = getPromptsDir();
    const distDir = join15(getScriptDir(), "dynamic_prompts");
    for (const subdir of ["Loop", "Rephrase"]) {
      const userSubDir = join15(userDir, subdir);
      const distSubDir = join15(distDir, subdir);
      if (!existsSync15(userSubDir)) {
        mkdirSync2(userSubDir, { recursive: true });
      }
      if (existsSync15(distSubDir)) {
        for (const file of readdirSync3(distSubDir)) {
          cpSync(join15(distSubDir, file), join15(userSubDir, file), { force: true });
        }
      }
    }
  }
  // ─────────────────────────────────────────────────────────────────────────────
  // Private - Pipeline Steps
  // ─────────────────────────────────────────────────────────────────────────────
  /**
   * Step 1: Compose dynamic system prompt (Rover only)
   * Uses PromptComposerAgent to build context-aware system prompt
   * @param {string} userQuery - The query to compose prompt for
   */
  async *#compose(userQuery) {
    const state = { messages: [{ role: "user", content: userQuery }] };
    const stream = await composerGraph.stream(state, this.baseConfig);
    for await (const chunk of stream) {
      yield* this.#yieldChunk(chunk);
    }
  }
  /**
   * Step 2: Search using given system prompt
   * Uses SearchAgent with provided prompt (Probe or Rover)
   * @param {string} userQuery - The query to search
   * @param {string} systemPrompt - System prompt to use for this search
   */
  async *#searchWithPrompt(userQuery, systemPrompt) {
    const config = {
      ...this.baseConfig,
      configurable: {
        ...this.baseConfig.configurable,
        systemPrompt
      }
    };
    const state = { messages: [{ role: "user", content: userQuery }] };
    const stream = await searchGraph.stream(state, config);
    for await (const chunk of stream) {
      yield* this.#yieldChunk(chunk);
    }
  }
  /**
   * Step 3: Refine prompts based on search results
   * Uses PromptRefineAgent to improve Rephrase and Loop prompts
   * Only runs if search was successful
   */
  async *#refine() {
    if (!this.#checkSearchSuccess()) return;
    const state = { messages: [] };
    const stream = await refineGraph.stream(state, this.baseConfig);
    for await (const chunk of stream) {
      yield* this.#yieldChunk(chunk);
    }
  }
  // ─────────────────────────────────────────────────────────────────────────────
  // Private - Prompt Loaders
  // ─────────────────────────────────────────────────────────────────────────────
  /**
   * Get system prompt for Rover mode
   * First checks for dynamic prompt file, otherwise builds from rover/rover_system_prompt.md
   * with ${Rephrase} and ${Loop} placeholders replaced
   * @returns {string} Rover system prompt text
   */
  #getRoverPrompt() {
    const dynamicPath = join15(getPromptsDir(), "dynamic_system_prompt.md");
    const dynamic = readFile(dynamicPath);
    if (dynamic) return dynamic;
    const configDir = join15(getConfigDir(), "rover");
    let prompt = readFile(join15(configDir, "rover_system_prompt.md")) || "You are a helpful assistant.";
    for (const [placeholder, fileName] of Object.entries({
      "${Rephrase}": "Rephrase.md",
      "${Loop}": "Loop.md"
    })) {
      const content = readFile(join15(configDir, fileName));
      if (content) prompt = prompt.replace(placeholder, content);
    }
    return prompt;
  }
  /**
   * Get system prompt for Probe mode
   * Loads from probe/probe_system_prompt.md - minimal static prompt
   * @returns {string} Probe system prompt text
   */
  #getProbePrompt() {
    const configDir = join15(getConfigDir(), "probe");
    return readFile(join15(configDir, "probe_system_prompt.md")) || "You are EVPAgent. Answer using Wikipedia.";
  }
  // ─────────────────────────────────────────────────────────────────────────────
  // Private - Session Management
  // ─────────────────────────────────────────────────────────────────────────────
  /**
   * Reset session files for a fresh query
   * Clears session_manifest.json and output.md
   * Called at start of both Probe and Rover pipelines
   */
  #resetSessionFiles() {
    const promptsDir = getPromptsDir();
    const manifestPath = join15(promptsDir, "session_manifest.json");
    const homeDir = process.env.APPDATA || join15(process.env.HOME || "", ".evpagent");
    const outputDir = process.platform === "win32" ? join15(process.env.APPDATA, "EVPAgent", "output") : process.platform === "darwin" ? join15(homeDir, "Library", "Application Support", "EVPAgent", "output") : join15(homeDir, ".config", "evpagent", "output");
    const outputFile = join15(outputDir, "output.md");
    const emptyManifest = {
      searchHistory: [],
      searchSuccess: false,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    writeFileSync6(manifestPath, JSON.stringify(emptyManifest, null, 2), "utf-8");
    if (existsSync15(outputFile)) {
      writeFileSync6(outputFile, "", "utf-8");
    }
  }
  // ─────────────────────────────────────────────────────────────────────────────
  // Private - Helpers
  // ─────────────────────────────────────────────────────────────────────────────
  /**
   * Check if the last search was successful
   * Reads searchSuccess from session_manifest.json
   * @returns {boolean} True if search succeeded
   */
  #checkSearchSuccess() {
    const manifest = readJson(join15(getPromptsDir(), "session_manifest.json"));
    return manifest?.searchSuccess === true;
  }
  /**
   * Yield a chunk from LangGraph output
   * Wraps extraction and handles null
   * @param {Object} chunk - LangGraph output chunk
   */
  *#yieldChunk(chunk) {
    const delta = this.#extractDelta(chunk);
    if (delta) yield delta;
  }
  /**
   * Extract OpenAI-compatible delta from LangGraph chunk
   * Returns tool calls or text content as appropriate chunk format
   * @param {Object} chunk - LangGraph output chunk
   * @returns {Object|null} Delta object or null
   */
  #extractDelta(chunk) {
    if (!chunk) return null;
    for (const [, nodeState] of Object.entries(chunk)) {
      if (!nodeState?.messages?.length) continue;
      const msg = nodeState.messages[nodeState.messages.length - 1];
      if (!msg) continue;
      if (msg.tool_calls?.length) {
        const tc = msg.tool_calls[0];
        return toolChunk(tc.name, tc.args || {});
      }
      if (msg.role === "tool") continue;
      if (isNonEmptyString(msg.content)) {
        return textChunk(msg.content);
      }
    }
    return null;
  }
};

// src/cli.js
var sysAgent = new SysAgent();
var currentMode = "probe";
var rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});
function print(msg) {
  process.stdout.write(msg + "\n");
}
async function askQuestion() {
  return new Promise((resolve) => {
    rl.question("User: ", (answer) => {
      resolve(answer);
    });
  });
}
async function runQuery(query) {
  let responseBuffer = "";
  let waitingForResponse = false;
  try {
    for await (const chunk of sysAgent.stream(query, currentMode)) {
      if (chunk?.choices?.[0]?.delta?.tool_calls) {
        const tc = chunk.choices[0].delta.tool_calls[0];
        const params = Object.entries(tc.args || {}).map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`).join(", ");
        print(`${tc.name}(${params})`);
        if (tc.name === "report") {
          waitingForResponse = true;
        }
      }
      if (chunk?.choices?.[0]?.delta?.content) {
        const content = chunk.choices[0].delta.content;
        if (waitingForResponse) {
          responseBuffer += content;
          waitingForResponse = false;
        }
      }
    }
    if (responseBuffer) {
      print(`${currentMode}: ${responseBuffer}`);
    } else {
      print(`${currentMode}: (no output)`);
    }
  } catch (error) {
    print(`Error: ${error.message}`);
  }
  const stats2 = sysAgent.getStats();
  const total = stats2.vectorHits + stats2.webRequests;
  if (total > 0) {
    const hitRate = Math.round(stats2.vectorHits / total * 100);
    print(`[Cache: ${hitRate}% (${stats2.vectorHits}/${total})]`);
  }
  sysAgent.resetStats();
}
function handleMode(command) {
  const parts = command.toLowerCase().replace("/", "").trim().split(/\s+/);
  const action = parts[0];
  const modeArg = parts[1];
  if (action === "mode" && !modeArg) {
    print(`Current mode: ${currentMode}`);
    print("  probe: fast search with minimal prompt");
    print("  rover: in-depth search with compose/refine pipeline");
    print("Usage: /mode probe, /mode rover");
  } else if (action === "mode" && modeArg === "probe") {
    currentMode = "probe";
    print("Switched to Probe mode (fast, minimal prompt)");
  } else if (action === "mode" && modeArg === "rover") {
    currentMode = "rover";
    print("Switched to Rover mode (in-depth, full pipeline)");
  } else {
    print("Usage: /mode, /mode probe, or /mode rover");
  }
}
async function handleReset(command) {
  const arg = command.split(" ")[1]?.toLowerCase();
  if (arg === "db") {
    print("Clearing vector DB...");
    await sysAgent.resetVectorDB();
    print("Vector DB cleared.");
  } else if (arg === "prompts") {
    print("Resetting prompts to default...");
    sysAgent.resetPrompts();
    print("Prompts reset.");
  } else if (arg === "all") {
    print("Resetting everything...");
    await sysAgent.resetVectorDB();
    sysAgent.resetPrompts();
    print("All reset complete.");
  } else {
    print("Usage: /reset [db|prompts|all]");
  }
}
print("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
print("          EVPAgent - Ask questions no one ever asked");
print("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
print("Commands: /mode | /reset | /exit\n");
async function main() {
  while (true) {
    const input = await askQuestion();
    const trimmed = input.trim();
    if (!trimmed) continue;
    if (trimmed.toLowerCase() === "/exit") {
      print("Goodbye!");
      break;
    }
    if (trimmed.toLowerCase().startsWith("/mode")) {
      handleMode(trimmed);
      print("");
      continue;
    }
    if (trimmed.toLowerCase().startsWith("/reset")) {
      await handleReset(trimmed);
      print("");
      continue;
    }
    await runQuery(trimmed);
    print("");
  }
  rl.close();
}
main();
//# sourceMappingURL=cli.js.map
