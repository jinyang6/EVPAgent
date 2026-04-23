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
import { join } from "path";
import z from "zod";
function getConfigDir() {
  const homeDir = process.env.APPDATA || join(process.env.HOME || "", ".evpagent");
  if (process.platform === "win32") {
    return join(process.env.APPDATA, "EVPAgent", "prompts", "config");
  } else if (process.platform === "darwin") {
    return join(homeDir, "Library", "Application Support", "EVPAgent", "prompts", "config");
  } else {
    return join(homeDir, ".config", "evpagent", "prompts", "config");
  }
}
var readSystemPromptTool = tool(
  async () => {
    const configDir = getConfigDir();
    const systemPromptPath = join(configDir, "system_prompt.md");
    if (!existsSync(systemPromptPath)) {
      return "Error: system_prompt.md not found in config directory";
    }
    return readFileSync(systemPromptPath, "utf-8");
  },
  {
    name: "readSystemPrompt",
    description: "Read the base system prompt template. Returns the full content of the system_prompt.md file which contains ${Rephrase} and ${Loop} placeholders.",
    schema: z.object({})
  }
);

// system/agents/PromptComposerAgent/tools/list/listPromptFiles.mjs
import { tool as tool2 } from "@langchain/core/tools";
import { readFileSync as readFileSync2, readdirSync, existsSync as existsSync2 } from "fs";
import { join as join2 } from "path";
import z2 from "zod";
function getPromptsDir() {
  const homeDir = process.env.APPDATA || join2(process.env.HOME || "", ".evpagent");
  if (process.platform === "win32") {
    return join2(process.env.APPDATA, "EVPAgent", "prompts", "dynamic_prompts");
  } else if (process.platform === "darwin") {
    return join2(homeDir, "Library", "Application Support", "EVPAgent", "prompts", "dynamic_prompts");
  } else {
    return join2(homeDir, ".config", "evpagent", "prompts", "dynamic_prompts");
  }
}
var listPromptFilesTool = tool2(
  async () => {
    const promptsDir = getPromptsDir();
    const allFiles = [];
    for (const folder of ["Rephrase", "Loop"]) {
      const folderPath = join2(promptsDir, folder);
      if (!existsSync2(folderPath)) continue;
      const files = readdirSync(folderPath).filter((f) => f.endsWith(".json")).map((f) => {
        try {
          const content = readFileSync2(join2(folderPath, f), "utf-8");
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
import { join as join3 } from "path";
import z3 from "zod";
function getPromptsDir2() {
  const homeDir = process.env.APPDATA || join3(process.env.HOME || "", ".evpagent");
  if (process.platform === "win32") {
    return join3(process.env.APPDATA, "EVPAgent", "prompts", "dynamic_prompts");
  } else if (process.platform === "darwin") {
    return join3(homeDir, "Library", "Application Support", "EVPAgent", "prompts", "dynamic_prompts");
  } else {
    return join3(homeDir, ".config", "evpagent", "prompts", "dynamic_prompts");
  }
}
function getConfigDir2() {
  const homeDir = process.env.APPDATA || join3(process.env.HOME || "", ".evpagent");
  if (process.platform === "win32") {
    return join3(process.env.APPDATA, "EVPAgent", "prompts", "config");
  } else if (process.platform === "darwin") {
    return join3(homeDir, "Library", "Application Support", "EVPAgent", "prompts", "config");
  } else {
    return join3(homeDir, ".config", "evpagent", "prompts", "config");
  }
}
var combinePromptsTool = tool3(
  async ({ prompts, userQuery }) => {
    const promptsDir = getPromptsDir2();
    const configDir = getConfigDir2();
    const systemPromptPath = join3(configDir, "system_prompt.md");
    if (!existsSync3(systemPromptPath)) {
      return "Error: system_prompt.md not found";
    }
    let systemPrompt = readFileSync3(systemPromptPath, "utf-8");
    for (const p of prompts) {
      const filePath = join3(promptsDir, p.section, `${p.promptName}.json`);
      if (existsSync3(filePath)) {
        const content = readFileSync3(filePath, "utf-8");
        const parsed = JSON.parse(content);
        const placeholder = p.section === "Rephrase" ? "${Rephrase}" : "${Loop}";
        systemPrompt = systemPrompt.replace(placeholder, parsed.content || "");
      }
    }
    const dynamicPromptPath = join3(promptsDir, "dynamic_system_prompt.md");
    writeFileSync(dynamicPromptPath, systemPrompt, "utf-8");
    const manifest = {
      userQuery,
      promptsUsed: prompts.map((p) => ({ section: p.section, name: p.promptName })),
      searchHistory: [],
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    const manifestPath = join3(promptsDir, "session_manifest.json");
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
import axios2 from "axios";
import { tool as tool4 } from "@langchain/core/tools";
import z4 from "zod";
import { readFileSync as readFileSync4, existsSync as existsSync4, writeFileSync as writeFileSync2 } from "fs";
import { join as join4 } from "path";

// system/agents/SearchAgent/tools/vector/vectorHelpers.mjs
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import axios from "axios";
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
  const { rmSync, existsSync: existsSync15 } = await import("fs");
  const dbPath = getVectorDBPath();
  if (existsSync15(dbPath)) {
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
    const response = await axios.get(url, {
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

// system/agents/SearchAgent/tools/wikipedia/searchWikipedia.mjs
function getPromptsDir3() {
  const homeDir = process.env.APPDATA || join4(process.env.HOME || "", ".evpagent");
  if (process.platform === "win32") {
    return join4(process.env.APPDATA, "EVPAgent", "prompts", "dynamic_prompts");
  } else if (process.platform === "darwin") {
    return join4(homeDir, "Library", "Application Support", "EVPAgent", "prompts", "dynamic_prompts");
  } else {
    return join4(homeDir, ".config", "evpagent", "prompts", "dynamic_prompts");
  }
}
function reportSearchResult(query, results) {
  try {
    const promptsDir = getPromptsDir3();
    const manifestPath = join4(promptsDir, "session_manifest.json");
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
  // useCache: z.boolean().optional().default(true).describe('Whether to use vector cache for retrieval'),
});
async function wikipediaSearch({
  query,
  limit = 5,
  type = "text"
  /*, useCache = true */
}) {
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
    const response = await axios2.get(url, {
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
import { join as join5 } from "path";
function getPromptsDir4() {
  const homeDir = process.env.APPDATA || join5(process.env.HOME || "", ".evpagent");
  if (process.platform === "win32") {
    return join5(process.env.APPDATA, "EVPAgent", "prompts", "dynamic_prompts");
  } else if (process.platform === "darwin") {
    return join5(homeDir, "Library", "Application Support", "EVPAgent", "prompts", "dynamic_prompts");
  } else {
    return join5(homeDir, ".config", "evpagent", "prompts", "dynamic_prompts");
  }
}
function reportFetchResult(page, section, content) {
  try {
    const promptsDir = getPromptsDir4();
    const manifestPath = join5(promptsDir, "session_manifest.json");
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
async function fetchWikiPage({ page, section, limit = 3, useCache = true }) {
  if (useCache) {
    const filterType = section !== void 0 ? "pageSection" : "pageOverview";
    const searchQuery = section !== void 0 ? `${page} ${section}` : page;
    try {
      const cachedResults = await searchVectorDB(searchQuery, limit, filterType);
      if (cachedResults && cachedResults.length > 0) {
        const matching = cachedResults.find((r) => r.metadata?.article === page);
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
import { join as join6 } from "path";
import z6 from "zod";
function getPromptsDir5() {
  const homeDir = process.env.APPDATA || join6(process.env.HOME || "", ".evpagent");
  if (process.platform === "win32") {
    return join6(process.env.APPDATA, "EVPAgent", "prompts", "dynamic_prompts");
  } else if (process.platform === "darwin") {
    return join6(homeDir, "Library", "Application Support", "EVPAgent", "prompts", "dynamic_prompts");
  } else {
    return join6(homeDir, ".config", "evpagent", "prompts", "dynamic_prompts");
  }
}
function getOutputDir() {
  const homeDir = process.env.APPDATA || join6(process.env.HOME || "", ".evpagent");
  if (process.platform === "win32") {
    return join6(process.env.APPDATA, "EVPAgent", "output");
  } else if (process.platform === "darwin") {
    return join6(homeDir, "Library", "Application Support", "EVPAgent", "output");
  } else {
    return join6(homeDir, ".config", "evpagent", "output");
  }
}
function getOutputFile() {
  return join6(getOutputDir(), "output.md");
}
var reportTool = tool6(
  async ({ searchSuccess, response }) => {
    const promptsDir = getPromptsDir5();
    const manifestPath = join6(promptsDir, "session_manifest.json");
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
import { join as join7 } from "path";
import z7 from "zod";
function getPromptsDir6() {
  const homeDir = process.env.APPDATA || join7(process.env.HOME || "", ".evpagent");
  if (process.platform === "win32") {
    return join7(process.env.APPDATA, "EVPAgent", "prompts", "dynamic_prompts");
  } else if (process.platform === "darwin") {
    return join7(homeDir, "Library", "Application Support", "EVPAgent", "prompts", "dynamic_prompts");
  } else {
    return join7(homeDir, ".config", "evpagent", "prompts", "dynamic_prompts");
  }
}
var readSessionManifestTool = tool7(
  async () => {
    const promptsDir = getPromptsDir6();
    const manifestPath = join7(promptsDir, "session_manifest.json");
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
import { join as join8 } from "path";
import z8 from "zod";
function getConfigDir3() {
  if (process.platform === "win32") {
    return join8(process.env.APPDATA, "EVPAgent", "prompts", "config");
  } else if (process.platform === "darwin") {
    return join8(process.env.HOME, "Library", "Application Support", "EVPAgent", "prompts", "config");
  } else {
    return join8(process.env.HOME, ".config", "evpagent", "prompts", "config");
  }
}
var readSystemPromptTool2 = tool8(
  async ({}) => {
    const configDir = getConfigDir3();
    const filePath = join8(configDir, "system_prompt.md");
    if (!existsSync8(filePath)) {
      const sourcePath = join8(process.cwd(), "system", "prompts", "config", "system_prompt.md");
      if (existsSync8(sourcePath)) {
        return readFileSync8(sourcePath, "utf-8");
      }
      return JSON.stringify({ error: `System prompt not found at ${filePath}` });
    }
    return readFileSync8(filePath, "utf-8");
  },
  {
    name: "readSystemPrompt",
    description: "Read the main system prompt (system_prompt.md) content. This is the primary prompt that guides search behavior.",
    schema: z8.object({})
  }
);

// system/agents/PromptRefineAgent/tools/list/listPromptFiles.mjs
import { tool as tool9 } from "@langchain/core/tools";
import { readFileSync as readFileSync9, readdirSync as readdirSync2, existsSync as existsSync9 } from "fs";
import { join as join9 } from "path";
import z9 from "zod";
function getPromptsDir7() {
  const homeDir = process.env.APPDATA || join9(process.env.HOME || "", ".evpagent");
  if (process.platform === "win32") {
    return join9(process.env.APPDATA, "EVPAgent", "prompts", "dynamic_prompts");
  } else if (process.platform === "darwin") {
    return join9(homeDir, "Library", "Application Support", "EVPAgent", "prompts", "dynamic_prompts");
  } else {
    return join9(homeDir, ".config", "evpagent", "prompts", "dynamic_prompts");
  }
}
var listPromptFilesTool2 = tool9(
  async ({ folder }) => {
    const promptsDir = getPromptsDir7();
    const folderPath = join9(promptsDir, folder);
    if (!existsSync9(folderPath)) {
      return JSON.stringify([]);
    }
    const files = readdirSync2(folderPath).filter((f) => f.endsWith(".json")).map((f) => {
      try {
        const content = readFileSync9(join9(folderPath, f), "utf-8");
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
import { join as join10 } from "path";
import z10 from "zod";
function getPromptsDir8() {
  const homeDir = process.env.APPDATA || join10(process.env.HOME || "", ".evpagent");
  if (process.platform === "win32") {
    return join10(process.env.APPDATA, "EVPAgent", "prompts", "dynamic_prompts");
  } else if (process.platform === "darwin") {
    return join10(homeDir, "Library", "Application Support", "EVPAgent", "prompts", "dynamic_prompts");
  } else {
    return join10(homeDir, ".config", "evpagent", "prompts", "dynamic_prompts");
  }
}
var readPromptTool = tool10(
  async ({ prompt }) => {
    const promptsDir = getPromptsDir8();
    const filePath = join10(promptsDir, prompt.section, `${prompt.promptName}.json`);
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
import { join as join11 } from "path";
import z11 from "zod";
function getPromptsDir9() {
  const homeDir = process.env.APPDATA || join11(process.env.HOME || "", ".evpagent");
  if (process.platform === "win32") {
    return join11(process.env.APPDATA, "EVPAgent", "prompts", "dynamic_prompts");
  } else if (process.platform === "darwin") {
    return join11(homeDir, "Library", "Application Support", "EVPAgent", "prompts", "dynamic_prompts");
  } else {
    return join11(homeDir, ".config", "evpagent", "prompts", "dynamic_prompts");
  }
}
var writePromptTool = tool11(
  async ({ prompt }) => {
    const promptsDir = getPromptsDir9();
    const folderPath = join11(promptsDir, prompt.section);
    if (!existsSync11(folderPath)) {
      return JSON.stringify({ error: `Folder ${prompt.section} does not exist` });
    }
    const filePath = join11(folderPath, `${prompt.promptName}.json`);
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
import { join as join12 } from "path";
import z12 from "zod";
function getPromptsDir10() {
  const homeDir = process.env.APPDATA || join12(process.env.HOME || "", ".evpagent");
  if (process.platform === "win32") {
    return join12(process.env.APPDATA, "EVPAgent", "prompts", "dynamic_prompts");
  } else if (process.platform === "darwin") {
    return join12(homeDir, "Library", "Application Support", "EVPAgent", "prompts", "dynamic_prompts");
  } else {
    return join12(homeDir, ".config", "evpagent", "prompts", "dynamic_prompts");
  }
}
var deletePromptTool = tool12(
  async ({ prompt }) => {
    const promptsDir = getPromptsDir10();
    const filePath = join12(promptsDir, prompt.section, `${prompt.promptName}.json`);
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
5. Read the prompt files that were used (Rephrase.md, Loop.md, system_prompt.md) to understand their content
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
import { join as join13, dirname } from "path";
import { homedir } from "os";
import { fileURLToPath } from "url";
function getBaseDir() {
  const homeDir = homedir();
  if (process.platform === "win32") {
    return process.env.APPDATA || join13(homeDir, ".evpagent");
  }
  if (process.platform === "darwin") {
    return join13(homeDir, "Library", "Application Support");
  }
  return process.env.XDG_CONFIG_HOME || join13(homeDir, ".config");
}
function getPromptsDir11() {
  return join13(getBaseDir(), "EVPAgent", "prompts", "dynamic_prompts");
}
function getConfigDir4() {
  return join13(getBaseDir(), "EVPAgent", "prompts", "config");
}
function getScriptDir() {
  if (typeof __dirname !== "undefined" && __dirname !== import.meta.url) {
    return __dirname;
  }
  return dirname(fileURLToPath(import.meta.url));
}

// system/agents/SysAgent/utils/files.mjs
import { existsSync as existsSync13, readFileSync as readFileSync13 } from "fs";
function readJson(path3) {
  if (!existsSync13(path3)) return null;
  try {
    return JSON.parse(readFileSync13(path3, "utf-8"));
  } catch {
    return null;
  }
}
function readFile(path3) {
  if (!existsSync13(path3)) return null;
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
import { existsSync as existsSync14, cpSync, mkdirSync as mkdirSync2, readdirSync as readdirSync3, unlinkSync as unlinkSync2 } from "fs";
import { join as join14 } from "path";
var SysAgent = class {
  // ─────────────────────────────────────────────────────────────────────────────
  // Constructor
  // ─────────────────────────────────────────────────────────────────────────────
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
  // Public API
  // ─────────────────────────────────────────────────────────────────────────────
  /** Stream results as async generator */
  async *stream(userQuery) {
    if (!this._initialized) await this.init();
    yield* this.compose(userQuery);
    yield* this.search(userQuery);
    yield* this.refine();
  }
  /** Collect all chunks into array */
  async invoke(userQuery) {
    const chunks = [];
    for await (const chunk of this.stream(userQuery)) {
      chunks.push(chunk);
    }
    return chunks;
  }
  /** Get cache stats */
  getStats() {
    return getStats();
  }
  /** Reset response stats */
  resetStats() {
    resetResponseStats();
  }
  /** Reset vector DB - delete all cached data */
  async resetVectorDB() {
    await resetVectorDB();
  }
  /** Reset prompts to default */
  resetPrompts() {
    const promptsDir = getPromptsDir11();
    for (const subdir of ["Loop", "Rephrase"]) {
      const dir = join14(promptsDir, subdir);
      if (!existsSync14(dir)) continue;
      for (const file of readdirSync3(dir)) {
        if (file.endsWith(".json")) {
          unlinkSync2(join14(dir, file));
        }
      }
    }
  }
  // ─────────────────────────────────────────────────────────────────────────────
  // Initialization
  // ─────────────────────────────────────────────────────────────────────────────
  /** Initialize: ensure config and prompt files exist */
  async init() {
    if (this._initialized) return;
    this._ensureConfigFiles();
    this._ensurePromptFiles();
    this._initialized = true;
  }
  /** Ensure config files are in user directory */
  _ensureConfigFiles() {
    const userDir = getConfigDir4();
    const distDir = join14(getScriptDir(), "prompts", "config");
    if (!existsSync14(userDir)) {
      mkdirSync2(userDir, { recursive: true });
    }
    for (const file of ["system_prompt.md", "Rephrase.md", "Loop.md"]) {
      const src = join14(distDir, file);
      const dest = join14(userDir, file);
      if (existsSync14(src)) cpSync(src, dest, { force: true });
    }
  }
  /** Ensure prompt subdirectories exist and copy defaults */
  _ensurePromptFiles() {
    const userDir = getPromptsDir11();
    const distDir = join14(getScriptDir(), "prompts", "dynamic_prompts");
    for (const subdir of ["Loop", "Rephrase"]) {
      const userSubDir = join14(userDir, subdir);
      const distSubDir = join14(distDir, subdir);
      if (!existsSync14(userSubDir)) {
        mkdirSync2(userSubDir, { recursive: true });
      }
      if (existsSync14(distSubDir)) {
        for (const file of readdirSync3(distSubDir)) {
          cpSync(join14(distSubDir, file), join14(userSubDir, file), { force: true });
        }
      }
    }
  }
  // ─────────────────────────────────────────────────────────────────────────────
  // Pipeline Steps
  // ─────────────────────────────────────────────────────────────────────────────
  /** Step 1: Compose dynamic system prompt */
  async *compose(userQuery) {
    const state = { messages: [{ role: "user", content: userQuery }] };
    const stream = await composerGraph.stream(state, this.baseConfig);
    for await (const chunk of stream) {
      yield* this.#yieldChunk(chunk);
    }
  }
  /** Step 2: Search using dynamic system prompt */
  async *search(userQuery) {
    const config = {
      ...this.baseConfig,
      configurable: { ...this.baseConfig.configurable, systemPrompt: this.#getSystemPrompt() }
    };
    const state = { messages: [{ role: "user", content: userQuery }] };
    const stream = await searchGraph.stream(state, config);
    for await (const chunk of stream) {
      yield* this.#yieldChunk(chunk);
    }
  }
  /** Step 3: Refine prompts (only if search succeeded) */
  async *refine() {
    if (!this.#checkSearchSuccess()) return;
    const state = { messages: [] };
    const stream = await refineGraph.stream(state, this.baseConfig);
    for await (const chunk of stream) {
      yield* this.#yieldChunk(chunk);
    }
  }
  // ─────────────────────────────────────────────────────────────────────────────
  // Private Helpers
  // ─────────────────────────────────────────────────────────────────────────────
  /** Get system prompt (dynamic or default with placeholders filled) */
  #getSystemPrompt() {
    const dynamicPath = join14(getPromptsDir11(), "dynamic_system_prompt.md");
    const dynamic = readFile(dynamicPath);
    if (dynamic) return dynamic;
    const configDir = getConfigDir4();
    let prompt = readFile(join14(configDir, "system_prompt.md")) || "You are a helpful assistant.";
    for (const [placeholder, fileName] of Object.entries({
      "${Rephrase}": "Rephrase.md",
      "${Loop}": "Loop.md"
    })) {
      const content = readFile(join14(configDir, fileName));
      if (content) prompt = prompt.replace(placeholder, content);
    }
    return prompt;
  }
  /** Check if search was successful */
  #checkSearchSuccess() {
    const manifest = readJson(join14(getPromptsDir11(), "session_manifest.json"));
    return manifest?.searchSuccess === true;
  }
  /** Yield chunk from LangGraph output */
  *#yieldChunk(chunk) {
    const delta = this.#extractDelta(chunk);
    if (delta) yield delta;
  }
  /** Extract OpenAI-compatible delta from LangGraph chunk */
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
    for await (const chunk of sysAgent.stream(query)) {
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
      print(`Agent: ${responseBuffer}`);
    } else {
      print("Agent: (no output)");
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
print("Commands: /reset [db|prompts|all] | /exit\n");
async function main() {
  while (true) {
    const input = await askQuestion();
    const trimmed = input.trim();
    if (!trimmed) continue;
    if (trimmed.toLowerCase() === "/exit") {
      print("Goodbye!");
      break;
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
