#!/usr/bin/env node
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// agent/tools/vector/chunker.mjs
var chunker_exports = {};
__export(chunker_exports, {
  getChunkingInfo: () => getChunkingInfo,
  simpleChunk: () => simpleChunk,
  splitText: () => splitText
});
function splitText(text, chunkSize = CHUNK_SIZE, chunkOverlap = CHUNK_OVERLAP) {
  if (!text || text.length === 0) {
    return [];
  }
  if (text.length <= chunkSize) {
    return [text];
  }
  const chunks = [];
  let startIndex = 0;
  while (startIndex < text.length) {
    let endIndex = startIndex + chunkSize;
    if (endIndex < text.length) {
      let breakPoint = -1;
      for (let i = endIndex; i > Math.max(startIndex, endIndex - 100); i--) {
        if (text[i] === " " || text[i] === "\n" || text[i] === "	") {
          breakPoint = i;
          break;
        }
      }
      if (breakPoint > startIndex) {
        endIndex = breakPoint;
      }
    }
    const chunk = text.slice(startIndex, endIndex).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    if (endIndex < text.length) {
      startIndex = endIndex;
      if (chunkOverlap > 0 && startIndex + chunkOverlap < text.length) {
        let overlapStart = startIndex;
        for (let i = startIndex + chunkOverlap; i > startIndex; i--) {
          if (text[i] === " " || text[i] === "\n") {
            overlapStart = i + 1;
            break;
          }
        }
        startIndex = overlapStart;
      }
    } else {
      break;
    }
  }
  return chunks.filter((chunk) => chunk.length > 0);
}
function simpleChunk(text, chunkSize = CHUNK_SIZE, chunkOverlap = CHUNK_OVERLAP) {
  if (!text || text.length === 0) {
    return [];
  }
  if (text.length <= chunkSize) {
    return [text];
  }
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = start + chunkSize;
    if (end < text.length) {
      let breakPoint = text.lastIndexOf(" ", end);
      if (breakPoint <= start) {
        breakPoint = text.indexOf(" ", end);
      }
      if (breakPoint === -1 || breakPoint === start) {
        breakPoint = Math.min(start + chunkSize, text.length);
      }
      end = breakPoint;
    }
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    start = end;
    if (start <= chunks.length * chunkSize - chunkSize) {
      start = Math.min(end + 1, text.length);
    }
  }
  return chunks;
}
function getChunkingInfo(text, chunkSize = CHUNK_SIZE) {
  const chunks = splitText(text, chunkSize);
  return {
    chunkCount: chunks.length,
    chunkSize,
    originalLength: text.length,
    averageChunkSize: chunks.length > 0 ? Math.round(chunks.reduce((sum, c) => sum + c.length, 0) / chunks.length) : 0,
    sizes: chunks.map((c) => c.length)
  };
}
var CHUNK_SIZE, CHUNK_OVERLAP;
var init_chunker = __esm({
  "agent/tools/vector/chunker.mjs"() {
    CHUNK_SIZE = 500;
    CHUNK_OVERLAP = 50;
  }
});

// src/cli.jsx
import "dotenv/config";
import React2 from "react";
import { render as render2 } from "ink";

// src/tui/App.jsx
import React, { useState, useCallback, useRef, useEffect } from "react";
import { render, Box, Text, useInput, Static } from "ink";

// agent/tools/stats.mjs
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
function recordQuery(query) {
}
function recordArticle(article) {
}
function formatStatsReport() {
  const total = stats.vectorHits + stats.webRequests;
  if (total === 0) return "";
  const hitRate = Math.round(stats.vectorHits / total * 100);
  return `[Cache hit rate: ${hitRate}% (${stats.vectorHits}/${total} requests)]`;
}
function resetResponseStats() {
  stats.responseCount++;
  stats.vectorHits = 0;
  stats.webRequests = 0;
}

// src/tui/App.jsx
var MAX_MESSAGES = 20;
var LoadingSpinner = () => {
  const [frame, setFrame] = useState(0);
  const frames = ["\u280B", "\u2819", "\u2839", "\u2838", "\u283C", "\u2834", "\u2826", "\u2827", "\u2807", "\u280F"];
  React.useEffect(() => {
    const id = setInterval(() => {
      setFrame((f) => (f + 1) % frames.length);
    }, 80);
    return () => clearInterval(id);
  }, []);
  return /* @__PURE__ */ React.createElement(Text, { dimColor: true }, frames[frame]);
};
var App = ({ agent: agent2, config: config2 }) => {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [toolQuery, setToolQuery] = useState(null);
  const [toolEntries, setToolEntries] = useState([]);
  const msgIdRef = useRef(0);
  useInput((char, key) => {
    if (key.return) {
      handleSubmit();
    } else if (key.backspace || key.delete) {
      setInput((prev) => prev.slice(0, -1));
    } else if (char) {
      setInput((prev) => prev + char);
    }
  });
  const handleSubmit = useCallback(async () => {
    if (!input.trim() || isLoading) return;
    const userInput = input.trim();
    setInput("");
    setIsLoading(true);
    setToolQuery(null);
    setToolEntries([]);
    setMessages((prev) => {
      const newMsgs = [...prev, { id: msgIdRef.current++, role: "user", content: userInput }];
      return newMsgs.slice(-MAX_MESSAGES);
    });
    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const initialState = {
        messages: [...history, { role: "user", content: userInput }]
      };
      const stream = await agent2.stream(initialState, config2);
      let finalResponse = "";
      for await (const chunk of stream) {
        if (chunk.agent?.messages) {
          const newestMsg = chunk.agent.messages[chunk.agent.messages.length - 1];
          if (newestMsg._getType() === "ai" || newestMsg.type === "ai") {
            if (newestMsg.tool_calls?.length > 0) {
              const toolCall = newestMsg.tool_calls[0];
              const args = toolCall.function?.arguments || "{}";
              let parsedArgs;
              try {
                parsedArgs = JSON.parse(args);
              } catch {
                parsedArgs = { raw: args };
              }
              setToolQuery({ name: toolCall.name, args: parsedArgs });
            }
            if (newestMsg.content) {
              finalResponse = newestMsg.content;
            }
          }
        }
        if (chunk.tools?.messages) {
          const toolMsg = chunk.tools.messages[0];
          if (toolMsg.content) {
            const lines = [];
            let start = 0;
            for (let i = 0; i < 5; i++) {
              const nlIndex = toolMsg.content.indexOf("\n", start);
              if (nlIndex === -1) {
                lines.push(toolMsg.content.slice(start, start + 200));
                break;
              }
              lines.push(toolMsg.content.slice(start, nlIndex));
              start = nlIndex + 1;
            }
            setToolEntries(lines.map((l) => ({ text: l })));
          }
        }
      }
      if (finalResponse) {
        setMessages((prev) => {
          const newMsgs = [...prev, { id: msgIdRef.current++, role: "assistant", content: finalResponse }];
          return newMsgs.slice(-MAX_MESSAGES);
        });
      }
      console.error(formatStatsReport());
      resetResponseStats();
    } catch (err) {
      setMessages((prev) => {
        const newMsgs = [...prev, { id: msgIdRef.current++, role: "error", content: err.message }];
        return newMsgs.slice(-MAX_MESSAGES);
      });
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages, agent2, config2]);
  return /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", height: 40 }, /* @__PURE__ */ React.createElement(Box, { marginBottom: 1 }, /* @__PURE__ */ React.createElement(Text, { bold: true, magenta: true }, "EVPAgent")), /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", overflowY: true, height: 35 }, /* @__PURE__ */ React.createElement(Static, { items: messages }, (msg) => /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", marginBottom: 1 }, /* @__PURE__ */ React.createElement(Text, { bold: true, color: msg.role === "user" ? "cyan" : "green" }, msg.role === "user" ? "User" : "Agent"), /* @__PURE__ */ React.createElement(Text, null, msg.content))), isLoading && /* @__PURE__ */ React.createElement(Box, { flexDirection: "column" }, /* @__PURE__ */ React.createElement(Box, { flexDirection: "row" }, /* @__PURE__ */ React.createElement(LoadingSpinner, null), /* @__PURE__ */ React.createElement(Text, { dimColor: true }, " "), toolQuery ? /* @__PURE__ */ React.createElement(Text, { yellow: true }, toolQuery.name, "(", Object.entries(toolQuery.args).map(([k, v]) => `${k}=${v}`).join(", "), ")") : /* @__PURE__ */ React.createElement(Text, { dimColor: true }, "thinking...")), toolEntries.length > 0 && /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", marginTop: 1 }, toolEntries.slice(0, 5).map((entry, i) => /* @__PURE__ */ React.createElement(Text, { key: i, dimColor: true }, entry.title ? `[${entry.title}]` : entry.text?.slice(0, 80) || "")), toolEntries.length > 5 && /* @__PURE__ */ React.createElement(Text, { dimColor: true }, "... and ", toolEntries.length - 5, " more")))), /* @__PURE__ */ React.createElement(Box, null, /* @__PURE__ */ React.createElement(Text, { cyan: true }, "\u27A4 "), /* @__PURE__ */ React.createElement(Text, null, input), /* @__PURE__ */ React.createElement(Text, { dimColor: true }, "_")));
};
var App_default = App;

// agent/graph/graph.mjs
import "dotenv/config";
import { StateGraph } from "@langchain/langgraph";

// agent/graph/state.mjs
import { Annotation, messagesStateReducer } from "@langchain/langgraph";
var AgentState = Annotation.Root({
  // Chat history
  messages: Annotation({
    reducer: messagesStateReducer,
    default: () => []
  })
});

// agent/llm/api/OpenAICompatible.mjs
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

// agent/tools/index.mjs
import path2 from "node:path";
import { ToolNode } from "@langchain/langgraph/prebuilt";

// agent/tools/wikipedia/searchWikipedia.mjs
import axios2 from "axios";
import { tool } from "@langchain/core/tools";
import z from "zod";

// agent/tools/vector/vectorHelpers.mjs
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
        baseURL: process.env.EMBEDDING_MODEL_BASE_URL,
        defaultHeaders: {
          "HTTP-Referer": "https://github.com/jinyang6/EVPAgent",
          "X-Title": "EVPAgent"
        }
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
    console.error(`Failed to get last edited time for ${pageTitle}:`, error.message);
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
    console.error("Vector DB search failed:", error.message);
    return [];
  }
}
async function upsertWikipediaSearch(query, results) {
  try {
    const tbl = await getTable();
    const embeddings = getEmbeddings();
    const records = [];
    for (const result of results) {
      const apiUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(result.title)}`;
      const lastEdited = await getLastEditedTime(result.title);
      const text = `Title: ${result.title}
URL: ${result.url}
Snippet: ${result.snippet}`;
      const id = generateDocId("wikipediaSearch", result.title, "", apiUrl);
      const vector = await embeddings.embedQuery(text);
      records.push({
        id,
        vector,
        text,
        type: "wikipediaSearch",
        article: result.title,
        section: "",
        url: apiUrl,
        lastEdited
      });
    }
    await tbl.add(records);
  } catch (error) {
  }
}
async function upsertWikiPage(page, section, content) {
  try {
    const tbl = await getTable();
    const embeddings = getEmbeddings();
    const url = buildWikiUrl(page, section);
    const lastEdited = await getLastEditedTime(page);
    const { splitText: splitText2 } = await Promise.resolve().then(() => (init_chunker(), chunker_exports));
    const chunks = splitText2(content);
    const records = [];
    for (let i = 0; i < chunks.length; i++) {
      const id = generateDocId(
        section ? "pageSection" : "pageOverview",
        page,
        section || "",
        `${url}#chunk-${i}`
      );
      const vector = await embeddings.embedQuery(chunks[i]);
      records.push({
        id,
        vector,
        text: chunks[i],
        type: section ? "pageSection" : "pageOverview",
        article: page,
        section: section || "",
        url,
        lastEdited
      });
    }
    await tbl.add(records);
  } catch (error) {
  }
}
function formatCachedSearchResults(cachedResults) {
  let output = "[Cache hit] Found relevant content:\n\n";
  const grouped = {
    wikipediaSearch: [],
    pageOverview: [],
    pageSection: []
  };
  for (const result of cachedResults) {
    const type = result.metadata?.type || "unknown";
    if (grouped[type]) {
      grouped[type].push(result);
    }
  }
  if (grouped.wikipediaSearch.length > 0) {
    output += "## Search Results (from cache)\n";
    for (const r of grouped.wikipediaSearch) {
      const meta = r.metadata;
      output += `[${meta.article}] ${meta.url}
`;
      output += `${r.document.slice(0, 200)}...

`;
    }
  }
  if (grouped.pageOverview.length > 0 || grouped.pageSection.length > 0) {
    output += "## Page Content (from cache)\n";
    for (const r of [...grouped.pageOverview, ...grouped.pageSection]) {
      const meta = r.metadata;
      const sectionNote = meta.section ? ` (section: ${meta.section})` : "";
      output += `**${meta.article}**${sectionNote}
`;
      output += `Source: ${meta.url}
`;
      output += `${r.document.slice(0, 300)}...

`;
    }
  }
  return output;
}

// agent/tools/wikipedia/searchWikipedia.mjs
var wikipediaSearchSchema = z.object({
  query: z.string().describe("The search query to find relevant Wikipedia articles"),
  limit: z.number().optional().default(5).describe("Number of results: 3 for simple facts, 5 for default, 10+ for comprehensive research"),
  type: z.enum(["text", "title", "nearmatch"]).optional().default("text").describe("Type of search: text (full text), title (title only), nearmatch (near match)"),
  useCache: z.boolean().optional().default(true).describe("Whether to use vector cache for retrieval")
});
async function wikipediaSearch({ query, limit = 5, type = "text", useCache = true }) {
  if (useCache) {
    try {
      const cachedResults = await searchVectorDB(query, limit, "wikipediaSearch");
      if (cachedResults && cachedResults.length > 0) {
        recordVectorHit("search");
        recordQuery(query);
        const formatted = formatCachedSearchResults(cachedResults);
        return `${formatted}

_Cache hit - retrieved from local vector database_`;
      }
    } catch (error) {
      console.error("[searchWikipedia] Cache lookup failed:", error.message);
    }
  }
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
    const resultsForCache = [];
    queryData.search.forEach((item, index) => {
      const articleUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, "_"))}`;
      const snippet = item.snippet?.replace(/<[^>]*>/g, "") || "No preview available";
      output += `[${index + 1}] ${item.title}
`;
      output += `${articleUrl}
`;
      output += `${snippet}

`;
      resultsForCache.push({
        title: item.title,
        url: articleUrl,
        snippet
      });
    });
    recordWebRequest("search");
    recordQuery(query);
    if (resultsForCache.length > 0) {
      upsertWikipediaSearch(query, resultsForCache).catch((error) => {
        console.error("[searchWikipedia] Failed to cache results:", error.message);
      });
    }
    return output.trim();
  } catch (error) {
    if (error.response?.status === 429) {
      return `Wikipedia search rate limited. Please wait and try again.`;
    }
    return `Wikipedia search for "${query}" failed: ${error.message}`;
  }
}
var searchWikipediaTool = tool(
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
- type (optional): 'text', 'title', or 'nearmatch'
- useCache (optional, default=true): Set to false to force web fetch

Returns: Titles, URLs, snippets. "[Cache hit]" if from cache.`,
    schema: wikipediaSearchSchema
  }
);

// agent/tools/wikipedia/fetchWikiPage.mjs
import axios3 from "axios";
import { tool as tool2 } from "@langchain/core/tools";
import z2 from "zod";
import * as cheerio from "cheerio";
import TurndownService from "turndown";
var wikiPageSchema = z2.object({
  page: z2.string().describe('Wikipedia page title (e.g., "Mars")'),
  section: z2.string().optional().describe('Section title to fetch (e.g., "Formation", omit for overview)'),
  limit: z2.number().optional().default(3).describe("Number of results from vector cache (top-k)"),
  useCache: z2.boolean().optional().default(true).describe("Whether to use vector cache for retrieval")
});
function decodeHtmlEntities(str) {
  return str.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10))).replace(/&#x([a-fA-F0-9]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16))).replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}
function htmlToMarkdown(html, pageTitle) {
  const $ = cheerio.load(html);
  const turndownService = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced"
  });
  turndownService.addRule("unEscapeCitationBrackets", {
    filter: function(node) {
      return node.nodeName === "TEXT";
    },
    replacement: function(content) {
      return content.replace(/\\\[(\d+)\\\]/g, "[$1]");
    }
  });
  const citationMap = /* @__PURE__ */ new Map();
  let citationIndex = 1;
  $("ol.references li").each((_, el) => {
    const $el = $(el);
    const rawId = $el.attr("id") || "";
    const decodedId = decodeHtmlEntities(rawId);
    const refLink = $el.find("a.external").first().attr("href") || "";
    const refText = $el.text().trim();
    const cleanText = refText.replace(/^\[\d+\]\s*/, "").slice(0, 150);
    if (cleanText.includes("Cite error") || cleanText.includes("invoked but never defined")) {
      return;
    }
    const citation = { index: citationIndex, text: cleanText, url: refLink };
    citationMap.set(rawId, citation);
    citationMap.set(decodedId, citation);
    citationIndex++;
  });
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
  $(".mw-editsection").remove();
  $(".mw-editsection-bracket").parent().remove();
  $(".references, ol.references, .mw-references-wrap").remove();
  $("div.empty, span.empty").remove();
  let markdown = turndownService.turndown($.html());
  markdown = markdown.replace(/\\\[(\d+)\\\]/g, "[$1]");
  return markdown;
}
function extractLeadText(html) {
  const $ = cheerio.load(html);
  $(".mw-editsection, .references, .printfooter, .catlinks, ol.references, .mw-references-wrap").remove();
  let leadText = "";
  $("p").each((i, el) => {
    if (i >= 3) return false;
    const text = $(el).text().trim();
    if (text.length > 50) {
      leadText += text + " ";
    }
  });
  leadText = leadText.replace(/\[\d+\]/g, "");
  return leadText.replace(/\s+/g, " ").trim();
}
async function fetchWikiPage({ page, section, limit = 3, useCache = true }) {
  const filterType = section !== void 0 ? "pageSection" : "pageOverview";
  const searchQuery = section !== void 0 ? `${page} ${section}` : page;
  if (useCache) {
    try {
      const cachedResults = await searchVectorDB(searchQuery, limit, filterType);
      if (cachedResults && cachedResults.length > 0) {
        const matching = cachedResults.find((r) => {
          return r.metadata?.article === page;
        });
        if (matching) {
          recordVectorHit(section ? "section" : "page");
          recordArticle(page);
          return `[Cache hit]

${matching.document}

_Cache hit - retrieved from local vector database_`;
        }
      }
    } catch (error) {
      console.error("[fetchWikiPage] Cache lookup failed:", error.message);
    }
  }
  try {
    const baseUrl = "https://en.wikipedia.org/w/api.php";
    const userAgent = "EVPAgent/1.0 (https://github.com/jinyang6/EVPAgent; jiatom519@gmail.com)";
    const pageUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(page.replace(/ /g, "_"))}`;
    const params = {
      action: "parse",
      page,
      prop: "text|sections",
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
    const sectionsData = data.parse.sections || [];
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

## ${section}

${markdown.slice(0, 4e3)}`;
      recordWebRequest("section");
      recordArticle(page);
      upsertWikiPage(page, section, markdown.slice(0, 4e3)).catch((error) => {
        console.error("[fetchWikiPage] Failed to cache section:", error.message);
      });
      return content;
    }
    const leadText = extractLeadText(html);
    let result = `# ${pageTitle}
**Source:** ${pageUrl}

`;
    result += `## Overview
${leadText.slice(0, 800)}

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

**Full content available - ask to fetch specific sections by title.**`;
    recordWebRequest("page");
    recordArticle(page);
    upsertWikiPage(page, "", result).catch((error) => {
      console.error("[fetchWikiPage] Failed to cache overview:", error.message);
    });
    return result;
  } catch (error) {
    if (error.response?.status === 404) {
      return `Wikipedia page "${page}" not found.`;
    }
    return `Error fetching Wikipedia page: ${error.message}`;
  }
}
var fetchWikiPageTool = tool2(
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
    schema: wikiPageSchema
  }
);

// agent/tools/index.mjs
var tools = [
  // webSearchTool, 
  // fetchUrlTool, 
  searchWikipediaTool,
  fetchWikiPageTool
  // searchBaikeTool, 
  // new ReadFileTool({ store }), 
];
var toolNode = new ToolNode(tools);

// agent/llm/agent.mjs
function getSystemPrompt(config2) {
  return config2?.configurable?.systemPrompt || "You are EVPAgent.";
}
async function callModel(state, config2) {
  const messages = state.messages;
  const { baseURL, apiKey, modelId, systemPrompt: systemPrompt2 } = config2.configurable;
  const fullMessages = [
    { role: "system", content: getSystemPrompt(config2) },
    ...messages
  ];
  const provider = createModel({
    baseURL,
    apiKey,
    modelId
  }).bindTools(tools);
  const response = await provider.invoke(fullMessages);
  return { messages: [response] };
}

// agent/graph/graph.mjs
import { START, END } from "@langchain/langgraph";
var workflow = new StateGraph(AgentState).addNode("agent", callModel).addNode("tools", toolNode).addEdge(START, "agent").addConditionalEdges("agent", (state) => {
  const messages = state.messages;
  const lastMessage = messages[messages.length - 1];
  const toolCalls = "tool_calls" in lastMessage ? lastMessage.tool_calls : [];
  if (toolCalls.length > 0) {
    return "tools";
  }
  return END;
}).addEdge("tools", "agent").compile();

// src/cli.jsx
import { readFileSync, existsSync, cpSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { homedir } from "os";
function getConfigDir() {
  const homeDir = homedir();
  if (process.platform === "win32") {
    return process.env.APPDATA ? join(process.env.APPDATA, "EVPAgent", "config") : join(homeDir, ".evpagent", "config");
  } else if (process.platform === "darwin") {
    return join(homeDir, "Library", "Application Support", "EVPAgent", "config");
  } else {
    return process.env.XDG_CONFIG_HOME ? join(process.env.XDG_CONFIG_HOME, "evpagent", "config") : join(homeDir, ".config", "evpagent", "config");
  }
}
function getScriptDir() {
  if (typeof __dirname !== "undefined") {
    return __dirname;
  }
  const scriptPath = fileURLToPath(import.meta.url);
  return dirname(scriptPath);
}
function ensureConfigFiles() {
  const userConfigDir2 = getConfigDir();
  const scriptDir = getScriptDir();
  const distConfigDir = join(scriptDir, "config");
  if (!existsSync(userConfigDir2)) {
    mkdirSync(userConfigDir2, { recursive: true });
  }
  const configFiles = [
    "system_prompt.md",
    "Rephrase.md",
    "Loop.md"
  ];
  for (const file of configFiles) {
    const src = join(distConfigDir, file);
    const dest = join(userConfigDir2, file);
    if (existsSync(src) && !existsSync(dest)) {
      cpSync(src, dest);
    }
  }
  return userConfigDir2;
}
function buildSystemPrompt(configDir) {
  const systemPromptPath = join(configDir, "system_prompt.md");
  let content = readFileSync(systemPromptPath, "utf-8");
  const replacements = {
    "${Rephrase}": "Rephrase.md",
    "${Loop}": "Loop.md"
  };
  for (const [placeholder, fileName] of Object.entries(replacements)) {
    const filePath = join(configDir, fileName);
    if (existsSync(filePath)) {
      const fileContent = readFileSync(filePath, "utf-8");
      content = content.replace(placeholder, fileContent);
    }
  }
  return content;
}
var userConfigDir = ensureConfigFiles();
var systemPrompt = buildSystemPrompt(userConfigDir);
var config = {
  configurable: {
    baseURL: process.env.SEARCH_MODEL_BASE_URL,
    apiKey: process.env.SEARCH_MODEL_API_KEY,
    modelId: process.env.SEARCH_MODEL_ID,
    systemPrompt
  },
  recursionLimit: 100
};
var agent = {
  stream: async (state, cfg) => {
    return await workflow.stream(state, cfg || config);
  }
};
render2(React2.createElement(App_default, { agent, config }), {
  exitOnCtrlC: true
});
//# sourceMappingURL=cli.js.map
