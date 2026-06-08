#!/usr/bin/env node

// src/cli.js
import readline from "readline";
import { spawn } from "child_process";
import { fileURLToPath as fileURLToPath2 } from "url";
import { dirname as dirname3, join as join16 } from "path";
import { marked } from "marked";
import { markedTerminal } from "marked-terminal";

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

// system/agents/PromptRefineAgent/graph.mjs
import { StateGraph as StateGraph2 } from "@langchain/langgraph";

// system/agents/PromptRefineAgent/state.mjs
import { Annotation as Annotation2, messagesStateReducer as messagesStateReducer2 } from "@langchain/langgraph";
var RefineState = Annotation2.Root({
  messages: Annotation2({
    reducer: messagesStateReducer2,
    default: () => []
  })
});

// system/agents/PromptRefineAgent/tools/index.mjs
import { ToolNode as ToolNode2 } from "@langchain/langgraph/prebuilt";

// system/agents/PromptRefineAgent/tools/read/readSessionManifest.mjs
import { tool as tool4 } from "@langchain/core/tools";
import { readFileSync as readFileSync4, existsSync as existsSync4 } from "fs";
import { join as join5 } from "path";
import z4 from "zod";
var readSessionManifestTool = tool4(
  async () => {
    const promptsDir = getUserPromptsDir();
    const manifestPath = join5(promptsDir, "session_manifest.json");
    if (!existsSync4(manifestPath)) {
      return JSON.stringify({ error: "session_manifest.json not found" });
    }
    return readFileSync4(manifestPath, "utf-8");
  },
  {
    name: "readSessionManifest",
    description: "Read the current session manifest containing user query, prompts used, and search history.",
    schema: z4.object({})
  }
);

// system/agents/PromptRefineAgent/tools/read/readSystemPrompt.mjs
import { tool as tool5 } from "@langchain/core/tools";
import { readFileSync as readFileSync5, existsSync as existsSync5 } from "fs";
import { join as join6 } from "path";
import z5 from "zod";
var readSystemPromptTool2 = tool5(
  async ({}) => {
    const configDir = getUserConfigDir();
    const filePath = join6(configDir, "rover", "rover_system_prompt.md");
    if (!existsSync5(filePath)) {
      return JSON.stringify({ error: `System prompt not found at ${filePath}` });
    }
    return readFileSync5(filePath, "utf-8");
  },
  {
    name: "readSystemPrompt",
    description: "Read the main system prompt (rover_system_prompt.md) content. This is the primary prompt that guides rover mode search behavior.",
    schema: z5.object({})
  }
);

// system/agents/PromptRefineAgent/tools/list/listPromptFiles.mjs
import { tool as tool6 } from "@langchain/core/tools";
import { readFileSync as readFileSync6, readdirSync as readdirSync2, existsSync as existsSync6 } from "fs";
import { join as join7 } from "path";
import z6 from "zod";
var listPromptFilesTool2 = tool6(
  async ({ folder }) => {
    const promptsDir = getUserPromptsDir();
    const folderPath = join7(promptsDir, folder);
    if (!existsSync6(folderPath)) {
      return JSON.stringify([]);
    }
    const files = readdirSync2(folderPath).filter((f) => f.endsWith(".json")).map((f) => {
      try {
        const content = readFileSync6(join7(folderPath, f), "utf-8");
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
    schema: z6.object({
      folder: z6.enum(["Rephrase", "Loop"]).describe("Folder to list: Rephrase or Loop")
    })
  }
);

// system/agents/PromptRefineAgent/tools/read/readPrompt.mjs
import { tool as tool7 } from "@langchain/core/tools";
import { readFileSync as readFileSync7, existsSync as existsSync7 } from "fs";
import { join as join8 } from "path";
import z7 from "zod";
var readPromptTool = tool7(
  async ({ prompt }) => {
    const promptsDir = getUserPromptsDir();
    const filePath = join8(promptsDir, prompt.section, `${prompt.promptName}.json`);
    if (!existsSync7(filePath)) {
      return JSON.stringify({ error: `Prompt ${prompt.promptName} not found in ${prompt.section}` });
    }
    return readFileSync7(filePath, "utf-8");
  },
  {
    name: "readPrompt",
    description: "Read a specific prompt file by section and name. Returns full JSON with name, description, and content.",
    schema: z7.object({
      prompt: z7.object({
        section: z7.enum(["Rephrase", "Loop"]).describe("Section folder: Rephrase or Loop"),
        promptName: z7.string().describe("Name of the prompt file (without .json)")
      })
    })
  }
);

// system/agents/PromptRefineAgent/tools/write/writePrompt.mjs
import { tool as tool8 } from "@langchain/core/tools";
import { readFileSync as readFileSync8, existsSync as existsSync8, writeFileSync as writeFileSync2 } from "fs";
import { join as join9 } from "path";
import z8 from "zod";
var writePromptTool = tool8(
  async ({ prompt }) => {
    const promptsDir = getUserPromptsDir();
    const folderPath = join9(promptsDir, prompt.section);
    if (!existsSync8(folderPath)) {
      return JSON.stringify({ error: `Folder ${prompt.section} does not exist` });
    }
    const filePath = join9(folderPath, `${prompt.promptName}.json`);
    const promptData = {
      name: prompt.promptName,
      description: prompt.description,
      content: prompt.content
    };
    writeFileSync2(filePath, JSON.stringify(promptData, null, 2), "utf-8");
    return `Written prompt ${prompt.promptName} to ${prompt.section} folder`;
  },
  {
    name: "writePrompt",
    description: "Write or update a prompt file with name, description, and content.",
    schema: z8.object({
      prompt: z8.object({
        section: z8.enum(["Rephrase", "Loop"]).describe("Section folder: Rephrase or Loop"),
        promptName: z8.string().describe("Name for the prompt file (without .json)"),
        description: z8.string().describe("Brief description of when to use this prompt"),
        content: z8.string().describe("The markdown content of the prompt")
      })
    })
  }
);

// system/agents/PromptRefineAgent/tools/delete/deletePrompt.mjs
import { tool as tool9 } from "@langchain/core/tools";
import { readFileSync as readFileSync9, existsSync as existsSync9, unlinkSync } from "fs";
import { join as join10 } from "path";
import z9 from "zod";
var deletePromptTool = tool9(
  async ({ prompt }) => {
    const promptsDir = getUserPromptsDir();
    const filePath = join10(promptsDir, prompt.section, `${prompt.promptName}.json`);
    if (!existsSync9(filePath)) {
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
    schema: z9.object({
      prompt: z9.object({
        section: z9.enum(["Rephrase", "Loop"]).describe("Section folder: Rephrase or Loop"),
        promptName: z9.string().describe("Name of the prompt file to delete (without .json)")
      })
    })
  }
);

// system/agents/PromptRefineAgent/tools/index.mjs
var tools2 = [
  readSessionManifestTool,
  readSystemPromptTool2,
  listPromptFilesTool2,
  readPromptTool,
  writePromptTool,
  deletePromptTool
];
var toolNode2 = new ToolNode2(tools2);

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
async function callModel2(state, config) {
  const { baseURL, apiKey, modelId } = config.configurable;
  const messages = state.messages;
  const provider = createModel({
    baseURL,
    apiKey,
    modelId
  }).bindTools(tools2);
  const fullMessages = [
    { role: "system", content: REFINE_SYSTEM_PROMPT },
    ...messages.length > 0 ? messages : [{ role: "user", content: "Please analyze the session and refine prompts as needed." }]
  ];
  let response;
  try {
    response = await provider.invoke(fullMessages);
  } catch (e) {
    console.error("[PromptRefineAgent] LLM invoke failed:", e.message);
    response = { role: "assistant", content: "Refine phase skipped \u2014 LLM unavailable." };
  }
  return { messages: [response] };
}

// system/agents/PromptRefineAgent/graph.mjs
import { START as START2, END as END2 } from "@langchain/langgraph";
var refineGraph = new StateGraph2(RefineState).addNode("agent", callModel2).addNode("tools", toolNode2).addEdge(START2, "agent").addConditionalEdges("agent", (state) => {
  const lastMessage = state.messages?.[state.messages.length - 1];
  if (lastMessage?.tool_calls?.length > 0) {
    return "tools";
  }
  return END2;
}).addEdge("tools", "agent").compile();

// system/agents/MainAgent/graph.mjs
import { StateGraph as StateGraph3 } from "@langchain/langgraph";

// system/agents/MainAgent/state.mjs
import { Annotation as Annotation3, messagesStateReducer as messagesStateReducer3 } from "@langchain/langgraph";
var AgentState = Annotation3.Root({
  // Chat history
  messages: Annotation3({
    reducer: messagesStateReducer3,
    default: () => []
  })
});

// system/agents/MainAgent/tools/index.mjs
import path2 from "node:path";
import { ToolNode as ToolNode3 } from "@langchain/langgraph/prebuilt";

// system/agents/MainAgent/tools/wikipedia/searchWikipedia.mjs
import { tool as tool10 } from "@langchain/core/tools";
import z10 from "zod";

// system/agents/MainAgent/tools/wikipedia/wikipediaHelpers.mjs
import axios from "axios";
import { readFileSync as readFileSync10, existsSync as existsSync10, writeFileSync as writeFileSync3, mkdirSync } from "fs";
import { join as join11 } from "path";
var WIKI_BASE_URL = "https://en.wikipedia.org/w/api.php";
var WIKI_USER_AGENT = "EVPAgent/1.0 (https://github.com/jinyang6/EVPAgent; jiatom519@gmail.com)";
function describeNetworkError(error) {
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
      return `DNS resolution failed for host (code ${code}) \u2014 check network/proxy`;
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
function logNetworkError(file, fn, error, context = "") {
  const why = describeNetworkError(error);
  const ctx = context ? ` (${context})` : "";
  console.error(`[${file}::${fn}]${ctx} ${why}`);
}
function reportWikiResult(toolName, args, result) {
  try {
    const promptsDir = getUserPromptsDir();
    const manifestPath = join11(promptsDir, "session_manifest.json");
    if (!existsSync10(promptsDir)) {
      mkdirSync(promptsDir, { recursive: true });
    }
    let manifest = { searchHistory: [], searchSuccess: false };
    if (existsSync10(manifestPath)) {
      try {
        const content = readFileSync10(manifestPath, "utf-8").trim();
        if (content) {
          manifest = JSON.parse(content);
        }
      } catch {
      }
    }
    if (!manifest.searchHistory) manifest.searchHistory = [];
    manifest.searchHistory.push({
      tool: toolName,
      arguments: args,
      result: result.slice(0, 1e3),
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
    writeFileSync3(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
  } catch (error) {
    console.error(`[wikipediaHelpers::reportWikiResult] failed:`, error.message);
  }
}
async function wikiRequest(action, params) {
  const urlParams = new URLSearchParams({ action, format: "json", ...params });
  try {
    const response = await axios.get(WIKI_BASE_URL, {
      params: urlParams,
      headers: { "User-Agent": WIKI_USER_AGENT },
      timeout: 15e3
    });
    return response.data;
  } catch (error) {
    logNetworkError("wikipediaHelpers", "wikiRequest", error, `action=${action}`);
    throw error;
  }
}
function buildWikiUrl(page, section) {
  const base = `https://en.wikipedia.org/wiki/${encodeURIComponent(page.replace(/ /g, "_"))}`;
  return section ? `${base}#${section.replace(/ /g, "_")}` : base;
}
function parseWikitext(wikitext) {
  if (!wikitext) return wikitext;
  const linkPattern = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;
  return wikitext.replace(linkPattern, (match, pagePart, displayText) => {
    const display = displayText || pagePart.split("#")[0];
    const url = `https://en.wikipedia.org/wiki/${pagePart.replace(/ /g, "_")}`;
    return `[${url} ${display}]`;
  });
}
async function fetchWikiImageInfo(fileTitle) {
  try {
    const title = fileTitle.startsWith("File:") ? fileTitle : `File:${fileTitle}`;
    const data = await wikiRequest("query", {
      prop: "imageinfo",
      iiprop: "url",
      titles: title
    });
    const pages = data?.query?.pages;
    if (!pages) return null;
    const page = Object.values(pages)[0];
    if (!page) return null;
    const info = page.imageinfo?.[0];
    if (!info?.url) return null;
    return {
      title: page.title,
      url: info.url,
      descriptionurl: info.descriptionurl
    };
  } catch (error) {
    logNetworkError("wikipediaHelpers", "fetchWikiImageInfo", error, `file="${fileTitle}"`);
    return null;
  }
}

// system/agents/MainAgent/tools/vector/vectorHelpers.mjs
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import axios2 from "axios";
import { connect } from "@lancedb/lancedb";
import { OpenAIEmbeddings } from "@langchain/openai";

// src/config.mjs
import { readFileSync as readFileSync11, writeFileSync as writeFileSync4, existsSync as existsSync11, mkdirSync as mkdirSync2 } from "fs";
import { join as join12, dirname } from "path";
function resolvePaths() {
  const userPath = process.env.EVPAGENT_USER_CONFIG_PATH;
  const exPath = process.env.EVPAGENT_EXAMPLE_CONFIG_PATH;
  if (userPath && exPath) {
    return { configPath: userPath, examplePath: exPath };
  }
  const cwd = process.cwd();
  return {
    configPath: join12(cwd, "config.json"),
    examplePath: join12(cwd, "config.example.json")
  };
}
var _config = null;
function loadConfig() {
  if (_config) return _config;
  const { configPath, examplePath } = resolvePaths();
  if (!existsSync11(configPath) && existsSync11(examplePath)) {
    console.log(`[config] First run \u2014 copying ${examplePath} \u2192 ${configPath}`);
    const dir = dirname(configPath);
    if (!existsSync11(dir)) mkdirSync2(dir, { recursive: true });
    const exampleContent = readFileSync11(examplePath, "utf-8");
    writeFileSync4(configPath, exampleContent, "utf-8");
  }
  if (!existsSync11(configPath)) {
    throw new Error(
      `config.json not found at "${configPath}".  Copy config.example.json to config.json and set your model.`
    );
  }
  const raw = readFileSync11(configPath, "utf-8").trim();
  if (!raw) {
    throw new Error(`config.json at "${configPath}" is empty.`);
  }
  try {
    _config = JSON.parse(raw);
  } catch (e) {
    throw new Error(`config.json is malformed: ${e.message}`);
  }
  for (const section of ["searchModel", "embeddingModel"]) {
    const s = _config[section];
    if (!s?.baseUrl || !s?.modelId) {
      throw new Error(
        `config.json is missing "${section}.baseUrl" or "${section}.modelId".`
      );
    }
  }
  return _config;
}
function getConfig() {
  return loadConfig();
}

// system/agents/MainAgent/tools/vector/vectorHelpers.mjs
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
var _cachedEmbeddingsInstance = null;
var _cachedEmbeddingsKey = void 0;
function getEmbeddings(apiKey) {
  const { embeddingModel } = getConfig();
  const normalizedKey = apiKey || void 0;
  if (!_cachedEmbeddingsInstance || _cachedEmbeddingsKey !== normalizedKey) {
    _cachedEmbeddingsInstance = new OpenAIEmbeddings({
      model: embeddingModel.modelId,
      apiKey: normalizedKey,
      configuration: {
        baseURL: embeddingModel.baseUrl
      }
    });
    _cachedEmbeddingsKey = normalizedKey;
  }
  return _cachedEmbeddingsInstance;
}
var db = null;
var table = null;
async function getTable(apiKey = null) {
  if (!table) {
    const dbPath = getVectorDBPath();
    db = await connect(dbPath);
    try {
      table = await db.openTable(TABLE_NAME);
    } catch (error) {
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
  _cachedEmbeddingsInstance = null;
  _cachedEmbeddingsKey = void 0;
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
    console.error(`[VectorDB::getLastEditedTime] failed for ${pageTitle}:`, error.message);
    return (/* @__PURE__ */ new Date()).toISOString();
  }
}
function buildWikiUrl2(article, section = null) {
  const encodedTitle = encodeURIComponent(article.replace(/ /g, "_"));
  if (section) {
    const encodedSection = encodeURIComponent(section.replace(/ /g, "_"));
    return `https://en.wikipedia.org/wiki/${encodedTitle}#${encodedSection}`;
  }
  return `https://en.wikipedia.org/wiki/${encodedTitle}`;
}
async function searchVectorDB(query, k = 3, filterType, apiKey = null) {
  if (!filterType) {
    throw new Error("filterType is required for searchVectorDB");
  }
  try {
    const tbl = await getTable(apiKey);
    const embeddings = getEmbeddings(apiKey);
    const queryEmbedding = await embeddings.embedQuery(query);
    const results = await tbl.search(queryEmbedding).limit(k * 2).toArray();
    const formattedResults = results.filter((row) => row.type === filterType).slice(0, k).map((row) => ({
      id: row.id,
      document: row.text,
      metadata: {
        type: row.type,
        article: row.article,
        section: row.section,
        sectionIndex: row.sectionIndex,
        url: row.url,
        lastEdited: row.lastEdited
      },
      distance: row._distance
    }));
    return formattedResults;
  } catch (error) {
    console.error(`[VectorDB::searchVectorDB] failed: ${error.message}. Falling back to web search.`);
    return [];
  }
}
async function upsertWikiPage(page, section, content, sectionIndex = 0, apiKey = null) {
  try {
    const tbl = await getTable(apiKey);
    const embeddings = getEmbeddings(apiKey);
    const url = buildWikiUrl2(page, section);
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
      sectionIndex,
      url,
      lastEdited
    }]);
  } catch (error) {
    console.error(`[VectorDB::upsertWikiPage] failed: ${error.message}`);
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

// system/agents/MainAgent/tools/wikipedia/searchWikipedia.mjs
var wikipediaSearchSchema = z10.object({
  query: z10.string().describe("The search query to find relevant Wikipedia articles"),
  limit: z10.number().optional().default(5).describe("Number of results: 3 for simple facts, 5 for default, 10+ for comprehensive research")
});
async function wikipediaSearch({ query, limit = 5 }, config) {
  const apiKey = config?.configurable?.apiKey || null;
  try {
    const [wikiData, cachedOverviews, cachedSections] = await Promise.all([
      wikiRequest("query", {
        list: "search",
        srsearch: query,
        srlimit: String(limit),
        srprop: "timestamp|snippet",
        utf8: "1"
      }),
      searchVectorDB(query, limit, "pageOverview", apiKey),
      searchVectorDB(query, limit, "pageSection", apiKey)
    ]);
    const queryData = wikiData?.query;
    const hasWikiResults = queryData?.search && queryData.search.length > 0;
    const cachedResults = [...cachedOverviews, ...cachedSections];
    if (!hasWikiResults && cachedResults.length === 0) {
      return `Wikipedia search for "${query}" returned no results.`;
    }
    let output = "";
    if (hasWikiResults) {
      output += `Wikipedia Search Results for "${query}":

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
    }
    if (cachedResults.length > 0) {
      output += "\n## Related cached content\n\n";
      output += formatCachedSearchResults(cachedResults);
    }
    reportWikiResult("searchWikipedia", { query, limit }, output);
    return output.trim();
  } catch (error) {
    logNetworkError("searchWikipedia", "wikipediaSearch", error, `query="${query}"`);
    if (error.response?.status === 429) {
      return `Wikipedia search rate limited. Please wait and try again.`;
    }
    return `Wikipedia search for "${query}" failed: ${error.message}`;
  }
}
var searchWikipediaTool = tool10(
  wikipediaSearch,
  {
    name: "searchWikipedia",
    description: `Search Wikipedia for relevant articles by query.

When to use:
- Use when you need to FIND which Wikipedia article to read
- Use BEFORE fetchWikiPage to locate the right page
- Use for: fact-checking, finding articles, locating sources

Parameters:
- query (required): Search query. Supports operators:
  - "exact phrase" for exact match
  - AND / OR / NOT for boolean logic (e.g., "Mars AND ocean NOT atmosphere")
  - intitle: for title-only search (e.g., intitle:"Curiosity rover")
  - insource: for article text search (e.g., insource:"olivine" "water")
  - incategory: for category search (e.g., incategory:"Space exploration")
- limit (optional, default=5): Number of results (3=facts, 5=default, 10+=research)

Returns: Numbered list of matching articles with titles, URLs, and snippets.`,
    schema: wikipediaSearchSchema
  }
);

// system/agents/MainAgent/tools/wikipedia/fetchWikiPage.mjs
import { tool as tool11 } from "@langchain/core/tools";
import z11 from "zod";

// system/agents/MainAgent/tools/stats.mjs
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

// system/agents/MainAgent/tools/wikipedia/fetchWikiPage.mjs
var wikiPageSchema = z11.object({
  page: z11.string().describe('Wikipedia page title (e.g., "Mars")'),
  sectionIndex: z11.number().optional().describe("Section index: Omit=overview (lead), 1+=specific section."),
  limit: z11.number().optional().default(3).describe("Vector cache top-k for semantic search"),
  useCache: z11.boolean().optional().default(true).describe("Whether to use vector cache for retrieval")
});
async function fetchWikiPage({ page, sectionIndex, limit = 3, useCache = true }, config) {
  const apiKey = config?.configurable?.apiKey || null;
  const normalizedSectionIndex = sectionIndex ?? 0;
  const pageUrl = buildWikiUrl(page);
  async function cacheLookup() {
    const filterType = sectionIndex !== void 0 && sectionIndex > 0 ? "pageSection" : "pageOverview";
    const cacheKey = sectionIndex !== void 0 ? `${page}:${sectionIndex}` : page;
    const cachedResults = await searchVectorDB(cacheKey, limit, filterType, apiKey);
    if (cachedResults && cachedResults.length > 0) {
      const matching = cachedResults.find(
        (r) => r.metadata?.article === page && r.metadata?.sectionIndex === normalizedSectionIndex
      );
      if (matching) {
        recordVectorHit(normalizedSectionIndex !== 0 ? "section" : "page");
        recordArticle(page);
        const sectionIdx = matching.metadata?.sectionIndex;
        const sectionNote = sectionIdx !== void 0 ? `(index: ${sectionIdx})` : "";
        const content = `[Cache hit] ${sectionNote}

${matching.document}

_Cache hit - retrieved from local vector database_`;
        reportWikiResult("fetchWikiPage", { page, sectionIndex: normalizedSectionIndex }, content);
        return content;
      }
    }
    return null;
  }
  async function cacheSection(sectionName, wikitext, idx) {
    await upsertWikiPage(page, sectionName, wikitext, idx, apiKey);
  }
  async function cacheOverview(wikitext) {
    await upsertWikiPage(page, "", wikitext, 0, apiKey);
  }
  if (useCache) {
    try {
      const cached = await cacheLookup();
      if (cached) return cached;
    } catch (error) {
      console.error("[fetchWikiPage::cacheLookup] failed:", error.message);
    }
  }
  try {
    const isSection = sectionIndex !== void 0 && sectionIndex > 0;
    let sectionsData = [];
    let wikitext = "";
    let pageTitle = page;
    if (isSection) {
      const data = await wikiRequest("parse", { page, prop: "wikitext", section: sectionIndex, redirects: "true" });
      if (!data?.parse) return `Wikipedia page "${page}" not found.`;
      wikitext = data.parse.wikitext?.["*"] || "";
      pageTitle = data.parse.title || page;
      const headerMatch = wikitext.match(/^==+\s*([^=]+?)\s*==+\s*/);
      const sectionName = headerMatch ? headerMatch[1].trim() : `Section ${sectionIndex}`;
      const sectionAnchor = sectionName.replace(/ /g, "_");
      const content = `# ${pageTitle} - ${sectionName} (index: ${sectionIndex})
**Source:** ${pageUrl}#${sectionAnchor}

${parseWikitext(wikitext)}`;
      recordWebRequest("section");
      recordArticle(page);
      cacheSection(sectionName, wikitext, sectionIndex).catch((error) => {
        console.error("[fetchWikiPage::cacheSection] failed:", error.message);
      });
      reportWikiResult("fetchWikiPage", { page, sectionIndex }, content);
      return content;
    }
    const [tocData, overviewData] = await Promise.all([
      wikiRequest("parse", { page, prop: "tocdata", redirects: "true" }),
      wikiRequest("parse", { page, prop: "wikitext", section: 0, redirects: "true" })
    ]);
    if (!tocData?.parse) return `Wikipedia page "${page}" not found.`;
    sectionsData = tocData.parse.tocdata?.sections || [];
    pageTitle = tocData.parse.title || page;
    wikitext = overviewData.parse?.wikitext?.["*"] || "";
    let result = `# ${pageTitle}
**Source:** ${pageUrl}

`;
    result += `## Overview
${parseWikitext(wikitext)}

`;
    result += `## Sections (${sectionsData.length})
`;
    if (sectionsData.length > 0) {
      sectionsData.forEach((s) => {
        if (!["Notes", "References", "External links", "See also"].includes(s.line)) {
          result += `- [${s.line}] (index: ${s.index})${s.anchor ? `, anchor: ${s.anchor}` : ""}
`;
        }
      });
    } else {
      result += `No sections found.
`;
    }
    result += `
---

**Full section available - specify index to fetch.**`;
    recordWebRequest("page");
    recordArticle(page);
    cacheOverview(wikitext).catch((error) => {
      console.error("[fetchWikiPage::cacheOverview] failed:", error.message);
    });
    reportWikiResult("fetchWikiPage", { page, sectionIndex: normalizedSectionIndex }, result);
    return result;
  } catch (error) {
    logNetworkError("fetchWikiPage", "fetchWikiPage", error, `page="${page}" section=${sectionIndex ?? 0}`);
    if (error.response?.status === 404) {
      return `Wikipedia page "${page}" not found.`;
    }
    return `Error fetching Wikipedia page: ${error.message}`;
  }
}
var fetchWikiPageTool = tool11(
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
1. fetchWikiPage({ page: "Mars" }) \u2192 overview + [1: "Discovery", 2: "Geography", ...]
2. fetchWikiPage({ page: "Mars", sectionIndex: 2 }) \u2192 "Geography" section content`,
    schema: wikiPageSchema
  }
);

// system/agents/MainAgent/tools/web/webFetchTool.mjs
import axios3 from "axios";
import { tool as tool12 } from "@langchain/core/tools";
import z12 from "zod";
import * as cheerio from "cheerio";
import TurndownService from "turndown";
var turnmarkdownService = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced"
});
turnmarkdownService.addRule("removeCitations", {
  filter: (node) => {
    return node.nodeName === "SUP" && node.classList.contains("reference");
  },
  replacement: () => ""
});
async function fetchUrl({ url }) {
  const unsupportedExts = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".zip", ".rar"];
  const hasUnsupportedExt = unsupportedExts.some((ext) => url.toLowerCase().includes(ext));
  if (hasUnsupportedExt) {
    return `Error: This URL points to a non-text content (PDF, DOC, etc.). Only websites that can be parsed to text are supported. Please provide a different URL or use web_search to find a text-based source.`;
  }
  try {
    const response = await axios3.get(url, {
      headers: {
        "User-Agent": "EVPAgent/1.0 (https://github.com/jinyang6/EVPAgent; jiatom519@gmail.com) axios/1.x"
      },
      timeout: 15e3
    });
    const $ = cheerio.load(response.data);
    const title = $("#firstHeading").text().trim() || $("title").text().trim().replace(" - Wikipedia", "") || "No Title";
    const isWikipedia = url.includes("wikipedia.org");
    let content;
    if (isWikipedia) {
      $(".infobox", ".navbox", ".toc", ".metadata", ".printfooter").remove();
      content = $("#mw-content-text").html() || $("body").html();
    } else {
      $("script, style, nav, footer, header, aside, noscript, .sidebar, .advertisement").remove();
      content = $("main").html() || $("article").html() || $("body").html();
    }
    if (!content) {
      return `Error: Could not extract content from ${url}. The page may not have readable content.`;
    }
    let markdown = turnmarkdownService.turndown(content);
    markdown = markdown.replace(/\n{4,}/g, "\n\n\n").replace(/\[(\d+)\]/g, "[$1]").replace(/\*\*See also\*\*[\s\S]*?$/i, "").replace(/\*\*References\*\*[\s\S]*?$/i, "").trim();
    return `# ${title}
**Source:** ${url}

${markdown}`;
  } catch (error) {
    const errorMessage = error?.message || "Unknown error occurred";
    return `Error fetching URL ${url}: ${errorMessage}`;
  }
}
var fetchUrlTool = tool12(
  fetchUrl,
  {
    name: "fetch_url",
    description: `Fetches a URL and converts it to clean Markdown.

When to use:
- After a search returns a relevant URL you want to read in full
- To extract specific details not in the search snippet
- To get complete information from a specific webpage

Usage tips:
- Only use for websites that can be parsed to text (HTML pages)
- Do NOT use for PDFs, DOCs, or other non-text content
- Use a search tool first to find the right URL
- One fetch per important source, not multiple
- Check the title to confirm it's the right page
- Extract only the sections you need from the content

Returns:
- Page title as header (# Title)
- Main content in clean Markdown

Input: URL to fetch`,
    schema: z12.object({
      url: z12.string().describe("The URL to fetch content from")
    })
  }
);

// system/agents/MainAgent/tools/postprocess/reportTool.mjs
import { tool as tool13 } from "@langchain/core/tools";
import { readFileSync as readFileSync12, existsSync as existsSync12, writeFileSync as writeFileSync5, mkdirSync as mkdirSync3 } from "fs";
import { join as join13 } from "path";
import z13 from "zod";
function getOutputFile() {
  return join13(getOutputDir(), "output.md");
}
function getFileTypeFromFormat(ext) {
  const format = ext.replace(/^\./, "").trim().toLowerCase();
  const formats = {
    video: ["ogv", "mp4", "webm", "avi", "mov", "mkv", "wmv"],
    audio: ["ogg", "mp3", "wav", "m4a", "flac", "aac", "oga", "opus"],
    image: ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "tiff", "tif"]
  };
  return Object.keys(formats).find((key) => formats[key].includes(format)) || "unknown";
}
function renderMedia({ title, url, descriptionurl }, description) {
  const caption = description || title.replace(/^File:/, "").replace(/_/g, " ");
  const ext = url.match(/\.(\w+)$/i)?.[1] || "";
  const type = getFileTypeFromFormat(ext);
  const isVideo = type === "video";
  const isAudio = type === "audio";
  const isImage = type === "image";
  let mediaTag;
  if (isVideo) {
    mediaTag = `<video src="${url}" controls style="width:100%;height:auto;display:block;margin:0 auto"></video>`;
  } else if (isAudio) {
    mediaTag = `<audio src="${url}" controls style="display:block;width:300px;max-width:100%;margin:0 auto"></audio>`;
  } else if (isImage) {
    mediaTag = `<img src="${url}" style="width:100%;height:auto;display:block;margin:0 auto">`;
  } else {
    mediaTag = `<a href="${url}" target="_blank" rel="noopener">Download ${caption}</a>`;
  }
  const sep = '<span style="display:inline-block;width:1px;height:0.85em;background:#bbb;vertical-align:middle;margin:0 0.25em"></span>';
  const credit = `<small><a href="${descriptionurl}" target="_blank" rel="noopener">Wikimedia</a></small>`;
  return [
    '<figure style="max-width:70%;margin:1.5em auto;text-align:center;overflow:hidden">',
    `  ${mediaTag}`,
    `  <figcaption style="margin-top:0.5em;font-size:0.9em;color:#555;text-align:justify;word-break:break-word;overflow-wrap:break-word">`,
    `    ${caption}${sep}${credit}`,
    `  </figcaption>`,
    "</figure>"
  ].join("\n");
}
var reportTool = tool13(
  async ({ searchSuccess, items }) => {
    const promptsDir = getUserPromptsDir();
    const manifestPath = join13(promptsDir, "session_manifest.json");
    if (items && items.length > 0) {
      const outputDir = getOutputDir();
      const outputFile = getOutputFile();
      if (!existsSync12(outputDir)) {
        mkdirSync3(outputDir, { recursive: true });
      }
      const mediaIndices = [];
      items.forEach((item, i) => {
        if (item.type === "media") mediaIndices.push(i);
      });
      const resolved = await Promise.all(
        mediaIndices.map((i) => fetchWikiImageInfo(items[i].content))
      );
      const parts = [];
      let ri = 0;
      for (const item of items) {
        if (item.type === "markdown") {
          parts.push(item.content);
        } else {
          const info = resolved[ri++];
          parts.push(info ? renderMedia(info, item.description) : `> Media not found: \`${item.content}\``);
        }
      }
      writeFileSync5(outputFile, parts.join("\n\n"), "utf-8");
    }
    if (!existsSync12(manifestPath)) {
      return "Error: session_manifest.json not found";
    }
    try {
      const manifest = JSON.parse(readFileSync12(manifestPath, "utf-8"));
      manifest.searchSuccess = searchSuccess;
      manifest.timestamp = (/* @__PURE__ */ new Date()).toISOString();
      writeFileSync5(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
      const itemCount = items?.length || 0;
      const mediaCount = items?.filter((i) => i.type === "media").length || 0;
      return `Report saved (${itemCount} items, ${mediaCount} media).`;
    } catch (error) {
      return `Error: ${error.message}`;
    }
  },
  {
    name: "report",
    description: `Finalize the research session and write the assembled article to output.md.

When to use:
- Call exactly ONCE at the end of every research session
- Call after you have gathered all content and are ready to produce the final article
- Must be called even if the search was unsuccessful (set searchSuccess: false)

Parameters:
- searchSuccess (required): Whether the search produced useful findings
- items (optional, default=[]): Ordered list of content blocks that form the article:
  - type "markdown": A section of the article in Markdown format
  - type "media": A Wikipedia/Commons file title (e.g., "BBH gravitational lensing of gw150914.webm").
    Optionally include a "description" field with an HTML caption for the media figure.
    When provided, this custom caption replaces the plain file-name fallback.

The tool resolves media file titles to real URLs via the Wikipedia API and
renders them as clean HTML figures with captions and source links. Markdown
sections are concatenated in order with media placed inline.

Returns: Confirmation message with item and media count.`,
    schema: z13.object({
      searchSuccess: z13.boolean().describe("Whether the search was successful"),
      items: z13.array(z13.object({
        type: z13.enum(["markdown", "media"]).describe("Content type: 'markdown' for article text, 'media' for a file title"),
        content: z13.string().describe("For markdown: article section in Markdown. For media: file title, e.g. 'Example.jpg' or 'BBH gravitational lensing of gw150914.webm'."),
        description: z13.string().describe("Optional HTML description/caption for media items only (ignored for markdown). When provided, this replaces the plain file-name caption under the media figure. Use to supply a custom, informative caption tailored to the article context.").optional()
      })).describe("Ordered list of content items that form the final article").optional().default([])
    })
  }
);

// system/agents/MainAgent/tools/delegation/deepSearch.mjs
import { tool as tool14 } from "@langchain/core/tools";
import z14 from "zod";
var deepSearchTool = tool14(
  async ({ query }, config) => {
    const apiKey = config?.configurable?.apiKey || null;
    const rover = new SysAgent({ apiKey });
    let result = "";
    for await (const chunk of rover.stream(
      [{ role: "user", content: query }],
      "rover",
      { signal: config?.signal }
    )) {
      const content = chunk?.choices?.[0]?.delta?.content;
      if (content) result = content;
    }
    if (result) {
      rover.resetSession();
      return result;
    }
    const success = rover.wasSearchSuccessful();
    rover.resetSession();
    return success ? "Search succeeded but no report was generated." : "Search failed. No report was generated.";
  },
  {
    name: "deepSearch",
    description: `Deep search a complex question that requires combining information from multiple sources into a formal report.

When to use:
- Use when the question demands a comprehensive, structured report with specific requirements
- Use for focused, academically-oriented topics that need formal research synthesis
- Use when the answer requires cross-referencing multiple Wikipedia articles or external sources

When NOT to use:
- Do NOT use for broad, open-ended topics or casual curiosity
- Do NOT use for simple fact lookups (e.g., "What year was X founded?")
- Do NOT use when a single Wikipedia article section would suffice

This launches the full rover pipeline (compose plan \u2192 multi-step search \u2192 refine prompts), which is slow but produces a thorough, citation-backed report. Reserve it for questions that genuinely require depth over speed.

Parameters:
- query (required): A specific, well-scoped research question. Should be precise and academic in nature (e.g., "How did Streamline Moderne architecture influence mid-century automotive design?") rather than broad or vague (e.g., "Tell me about cars").

Returns: A comprehensive Markdown report synthesizing findings from multiple sources.`,
    schema: z14.object({
      query: z14.string().describe(
        "A specific, well-defined research question requiring formal investigation across multiple sources. Should be focused and academic, not a broad or casual query."
      )
    })
  }
);

// system/agents/MainAgent/tools/index.mjs
var tools3 = [
  searchWikipediaTool,
  fetchWikiPageTool,
  fetchUrlTool,
  deepSearchTool,
  reportTool
];
var toolNode3 = new ToolNode3(tools3);

// system/agents/MainAgent/agent.mjs
async function callModel3(state, config) {
  const messages = state.messages;
  const { baseURL, apiKey, modelId, systemPrompt, tools: allowedTools } = config.configurable;
  const ALWAYS_ENABLED = ["report"];
  const activeTools = allowedTools ? tools3.filter((t) => ALWAYS_ENABLED.includes(t.name) || allowedTools[t.name] === true) : tools3;
  const fullMessages = [
    { role: "system", content: systemPrompt || "You are EVPAgent." },
    ...messages
  ];
  const provider = createModel({
    baseURL,
    apiKey,
    modelId
  }).bindTools(activeTools);
  const response = await provider.invoke(fullMessages);
  return { messages: [response] };
}

// system/agents/MainAgent/graph.mjs
import { START as START3, END as END3 } from "@langchain/langgraph";
var mainGraph = new StateGraph3(AgentState).addNode("agent", callModel3).addNode("tools", toolNode3).addEdge(START3, "agent").addConditionalEdges("agent", (state) => {
  const lastMessage = state.messages?.[state.messages.length - 1];
  if (lastMessage?.tool_calls?.length > 0) {
    return "tools";
  }
  return END3;
}).addEdge("tools", "agent").compile();

// system/agents/SysAgent/utils/paths.mjs
import { join as join14, dirname as dirname2 } from "path";
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
  const entryDir = dirname2(fileURLToPath(import.meta.url));
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
import { existsSync as existsSync15, cpSync, mkdirSync as mkdirSync4, readdirSync as readdirSync3, unlinkSync as unlinkSync2, writeFileSync as writeFileSync6, readFileSync as readFileSync14 } from "fs";
import { join as join15 } from "path";
var SysAgent = class {
  // ─────────────────────────────────────────────────────────────────────────────
  // Constructor & Config
  // ─────────────────────────────────────────────────────────────────────────────
  /**
   * Create a new SysAgent instance.
   *
   * Configures the LangGraph baseConfig with LLM settings and optional tool filtering.
   * The `tools` option accepts a boolean map to enable/disable specific tools:
   * `{ searchWikipedia: true, fetchWikiPage: true }`
   * `report` is always enabled regardless of this setting.
   * `null` or omitted means all tools enabled.
   *
   * @param {Object} config - Configuration options
   * @param {string} [config.baseURL] - LLM API base URL (defaults to config.json searchModel.baseUrl)
   * @param {string} [config.apiKey] - LLM API key (user-provided via Settings; no default)
   * @param {string} [config.modelId] - LLM model identifier (defaults to config.json searchModel.modelId)
   * @param {Object|null} [config.tools] - Boolean map for tool filtering
   */
  constructor(config = {}) {
    const { searchModel } = getConfig();
    this.baseConfig = {
      configurable: {
        // Explicit config always wins; fall back to config.json
        baseURL: config.baseURL || searchModel.baseUrl,
        apiKey: config.apiKey || null,
        // API key comes from Settings (user-provided), not config.json
        modelId: config.modelId || searchModel.modelId,
        tools: config.tools || null
        // {searchWikipedia: true, fetchWikiPage: false} — null = all enabled
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
   * @param {Array<{role: string, content: string}>} messages - Chat history (CLI-maintained)
   * @param {'probe'|'rover'} mode - Workflow mode: probe (fast) or rover (in-depth)
   * @param {Object} [opts]
   * @param {AbortSignal} [opts.signal] - Abort signal to cancel execution
   * @param {string} [opts.apiKey] - API key override (applied per-call; allows reuse of a pre-created instance)
   */
  async *stream(messages, mode2 = "probe", { signal, apiKey } = {}) {
    if (!this._initialized) await this.init();
    if (apiKey) {
      this.baseConfig.configurable.apiKey = apiKey;
    }
    this.#resetSessionFiles();
    const tools4 = mode2 === "probe" ? { searchWikipedia: true, fetchWikiPage: true, fetch_url: true, deepSearch: true } : { searchWikipedia: true, fetchWikiPage: true, fetch_url: true };
    if (mode2 === "probe") {
      yield* this.#runMainAgent(messages, this.#getProbePrompt(), tools4, signal);
    } else {
      const userQuery = messages.findLast((m) => m.role === "user")?.content || "";
      yield* this.#compose(userQuery, signal);
      yield* this.#runMainAgent([{ role: "user", content: userQuery }], this.#getRoverPrompt(), tools4, signal);
      yield* this.#refine(signal);
    }
    const outputContent = this.#readOutputFile();
    if (outputContent) yield textChunk(outputContent);
  }
  /**
   * Collect all chunks into array and return
   * @param {string} userQuery - The query to search
   * @param {'probe'|'rover'} mode - Workflow mode
   * @returns {Promise<Array>} Array of chunks
   */
  async invoke(userQuery, mode2 = "probe") {
    const chunks = [];
    for await (const chunk of this.stream(userQuery, mode2)) {
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
  /**
   * Check session manifest to determine if the last search was successful.
   * @returns {boolean} True if search succeeded
   */
  wasSearchSuccessful() {
    return this.#checkSearchSuccess();
  }
  /**
   * Reset session files to clean state.
   * Exposed for subagent callers (e.g., deepSearch tool) to prevent
   * polluting the caller's session manifest and output.
   */
  resetSession() {
    this.#resetSessionFiles();
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
      mkdirSync4(userDir, { recursive: true });
    }
    const roverSrc = join15(distDir, "rover");
    const roverDest = join15(userDir, "rover");
    if (!existsSync15(roverDest)) mkdirSync4(roverDest, { recursive: true });
    for (const file of ["rover_system_prompt.md", "Loop.md", "Rephrase.md"]) {
      const src = join15(roverSrc, file);
      const dest = join15(roverDest, file);
      if (existsSync15(src)) cpSync(src, dest, { force: true });
    }
    const probeSrc = join15(distDir, "probe");
    const probeDest = join15(userDir, "probe");
    if (!existsSync15(probeDest)) mkdirSync4(probeDest, { recursive: true });
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
        mkdirSync4(userSubDir, { recursive: true });
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
   * @param {AbortSignal} [signal]
   */
  async *#compose(userQuery, signal) {
    const state = { messages: [{ role: "user", content: userQuery }] };
    const config = { ...this.baseConfig, signal };
    const stream = await composerGraph.stream(state, config);
    for await (const chunk of stream) {
      yield* this.#yieldChunk(chunk);
    }
  }
  /**
   * Step 2: Run MainAgent with given messages, system prompt and tool set
   * @param {Array<{role: string, content: string}>} messages - Messages to send as initial state
   * @param {string} systemPrompt - System prompt to use
   * @param {Object} tools - Boolean map of enabled tools
   * @param {AbortSignal} [signal]
   */
  async *#runMainAgent(messages, systemPrompt, tools4, signal) {
    const config = {
      ...this.baseConfig,
      configurable: {
        ...this.baseConfig.configurable,
        systemPrompt,
        tools: tools4
      },
      signal
    };
    const state = { messages };
    const stream = await mainGraph.stream(state, config);
    for await (const chunk of stream) {
      yield* this.#yieldChunk(chunk);
    }
  }
  /**
   * Step 3: Refine prompts based on search results
   * Uses PromptRefineAgent to improve Rephrase and Loop prompts
   * Only runs if search was successful
   * @param {AbortSignal} [signal]
   */
  async *#refine(signal) {
    if (!this.#checkSearchSuccess()) return;
    const state = { messages: [] };
    const config = { ...this.baseConfig, signal };
    const stream = await refineGraph.stream(state, config);
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
   * Read output.md content after agent finishes (written by report tool)
   * @returns {string|null} Output content or null if file empty/missing
   */
  #readOutputFile() {
    const outputPath = join15(getOutputDir(), "output.md");
    if (!existsSync15(outputPath)) return null;
    const content = readFileSync14(outputPath, "utf-8").trim();
    return content || null;
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

// src/core/AgentService.mjs
var DEFAULT_CONTEXT_LENGTH = 128e3;
var MODELS = Object.freeze([
  {
    id: "probe",
    object: "model",
    created: 171e7,
    // owned_by: 'evpagent',
    name: "probe",
    description: "General-purpose agent handling simple to complex questions. Maintains multi-turn conversation context and can fetch external sources via web_fetch when editing or researching beyond Wikipedia. For deep investigations, delegates to the rover pipeline as a subagent via deepSearch. Produces multimodal responses with embedded media (images, audio, video) from Wikipedia.",
    supported_modalities: ["text"],
    output_modalities: ["text"],
    pricing: null
  },
  {
    id: "rover",
    object: "model",
    created: 171e7,
    // owned_by: 'evpagent',
    name: "rover",
    description: "Single-question deep research pipeline. Takes one question at a time, composes a dynamic research plan, performs multi-step Wikipedia-only investigation across multiple articles, and returns one complete, citation-backed report. In-depth but stateless \u2014 lacks multi-turn conversation context. Best for complex, multi-faceted, or expert-level research questions.",
    supported_modalities: ["text"],
    output_modalities: ["text"],
    pricing: null
  }
]);
var MODEL_MAP = Object.freeze(Object.fromEntries(MODELS.map((m) => [m.id, m])));
function formatToolCall({ name, args }) {
  const params = Object.entries(args || {}).map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`).join(", ");
  return `${name}(${params})`;
}
function normalizeMessages(messages) {
  if (!Array.isArray(messages)) {
    throw Object.assign(
      new Error("messages must be an array of { role, content }."),
      { statusCode: 400, param: "messages" }
    );
  }
  return messages.map((m) => ({
    role: m.role || "user",
    content: typeof m.content === "string" ? m.content : Array.isArray(m.content) ? m.content.map((p) => typeof p === "string" ? p : p.text || "").join("") : String(m.content || "")
  }));
}
var AgentService = {
  // ── Initialization ────────────────────────────────────────────────────────
  /** Resolved context length from the provider, or null if not yet fetched */
  _contextLength: null,
  /**
   * Fetch the actual context length of the configured search model
   * from the provider's models endpoint.  Falls back to 128000 on failure.
   *
   * Reads baseUrl and modelId from config.json (searchModel).
   * apiKey is not needed here — context_length is a property of the model, not the key.
   *
   * @returns {Promise<void>}
   */
  async init() {
    const { searchModel: { baseUrl, modelId } } = getConfig();
    if (!baseUrl || !modelId) {
      this._contextLength = DEFAULT_CONTEXT_LENGTH;
      return;
    }
    try {
      const modelsUrl = baseUrl.replace(/\/+$/, "") + "/models";
      const response = await fetch(modelsUrl, {
        signal: AbortSignal.timeout(5e3)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      const models = json.data || json.models || [];
      const shortId = modelId.includes("/") ? modelId.split("/").pop() : modelId;
      const baseId = shortId.includes(":") ? shortId.split(":")[0] : shortId;
      const match = (Array.isArray(models) ? models : []).find((m) => {
        const id = m.id || m.name || "";
        return id === modelId || id === shortId || id === baseId || id.endsWith("/" + shortId) || id.endsWith("/" + baseId);
      });
      if (match) {
        this._contextLength = match.context_length || match.context_window || match.contextWindow || DEFAULT_CONTEXT_LENGTH;
        console.log(`[AgentService] context_length resolved to ${this._contextLength} for ${modelId}`);
        return;
      }
      console.warn(`[AgentService] model ${modelId} not found in provider listing, using default`);
    } catch (e) {
      console.warn(`[AgentService] could not fetch context length: ${e.message}`);
    }
    this._contextLength = DEFAULT_CONTEXT_LENGTH;
  },
  // ── Model Registry ───────────────────────────────────────────────────────
  /**
   * OpenAI /v1/models shape.
   * @returns {{ object: 'list', data: Array }}
   */
  listModels() {
    return { object: "list", data: this._injectContextLength(MODELS) };
  },
  /**
   * Get a single model by id.
   * @param {string} id - e.g. "probe"
   * @returns {Object|null} Model object or null
   */
  getModel(id) {
    const model = MODEL_MAP[id];
    if (!model) return null;
    return this._injectContextLength([model])[0];
  },
  /**
   * Check whether a model id is valid.
   * @param {string} id
   * @returns {boolean}
   */
  isValidModel(id) {
    return id in MODEL_MAP;
  },
  /**
   * Map a model id to a mode. Unknown → 'probe'.
   * @param {string} model
   * @returns {'probe'|'rover'}
   */
  resolveMode(model) {
    return MODEL_MAP[model] ? model : "probe";
  },
  // ── Private ──────────────────────────────────────────────────────────────
  /**
   * Spread the dynamic context_length into model objects.
   * @param {Array<Object>} models
   * @returns {Array<Object>}
   */
  _injectContextLength(models) {
    const len = this._contextLength || DEFAULT_CONTEXT_LENGTH;
    return models.map((m) => ({ ...m, context_length: len }));
  },
  // ── Input Validation ─────────────────────────────────────────────────────
  /**
   * Validate and normalize an incoming messages array.
   * Used by the chat route before delegating to the adapter.
   *
   * @param {any} messages
   * @returns {Array<{role: string, content: string}>}
   * @throws {Error} with { statusCode, param } on invalid input
   */
  validateMessages(messages) {
    return normalizeMessages(messages);
  },
  // ── Streaming ────────────────────────────────────────────────────────────
  /**
   * Stream agent execution as normalized events.
   *
   * Tool calls are yielded immediately.  Content chunks overwrite a buffer
   * variable — only the last one (output.md) is yielded when the stream ends.
   *
   * Yields:
   *   { type: 'tool',    text: string }  — each tool invocation (real-time)
   *   { type: 'content', text: string }  — terminal output only (at stream end)
   *
   * @param {Array<{role: string, content: string}>} messages
   * @param {'probe'|'rover'} mode
   * @param {Object} [opts]
   * @param {SysAgent} [opts.agent] - Reuse an existing instance (CLI keeps stats)
   * @param {AbortSignal} [opts.signal] - Abort signal to cancel execution
   * @param {string} [opts.apiKey] - OpenRouter API key (overrides .env SEARCH_MODEL_API_KEY)
   * @returns {AsyncGenerator<{ type: string, text: string }>}
   */
  async *streamEvents(messages, mode2 = "probe", { agent, signal, apiKey } = {}) {
    console.log("[AgentService] streamEvents started, mode:", mode2, apiKey ? "(using user apiKey)" : "(using .env key)");
    const sysAgent2 = agent || new SysAgent({ apiKey });
    const normalized = normalizeMessages(messages);
    let content = "";
    try {
      for await (const chunk of sysAgent2.stream(normalized, mode2, { signal, apiKey })) {
        const delta = chunk?.choices?.[0]?.delta;
        if (!delta) continue;
        if (delta.tool_calls) {
          const tc = delta.tool_calls[0];
          yield {
            type: "tool",
            text: formatToolCall(tc),
            name: tc.name,
            args: tc.args || {}
          };
        }
        if (delta.content && delta.content !== "") {
          content = delta.content;
        }
      }
    } catch (e) {
      console.error("[AgentService] streamEvents error:", e.message, e.stack);
      throw e;
    }
    console.log("[AgentService] streamEvents finished, content length:", content?.length);
    yield {
      type: "content",
      text: content || "No output."
    };
  }
};

// src/cli.js
var __dirname = dirname3(fileURLToPath2(import.meta.url));
var srcDir = __dirname.endsWith("dist") ? join16(__dirname, "..") : __dirname;
var serverEntry = join16(srcDir, "api", "index.mjs");
marked.use(markedTerminal());
var sysAgent = new SysAgent();
var mode = "probe";
var chatHistory = [];
var _serverProcess = null;
var C = (code, s) => `\x1B[${code}m${s}\x1B[0m`;
var bold = (s) => C(1, s);
var cyan = (s) => C(36, s);
var green = (s) => C(32, s);
var yellow = (s) => C(33, s);
var dim = (s) => C(2, s);
var modeLabel = { probe: green("PROBE"), rover: yellow("ROVER") };
var userLabel = cyan("User");
var rl = readline.createInterface({ input: process.stdin, output: process.stdout });
var ask = () => new Promise((resolve) => rl.question(`${userLabel}: `, resolve));
async function runQuery(query) {
  chatHistory.push({ role: "user", content: query });
  let response = "";
  try {
    for await (const event of AgentService.streamEvents(chatHistory, mode, { agent: sysAgent })) {
      if (event.type === "tool") {
        console.log(dim(event.text));
      }
      if (event.type === "content") {
        response = event.text;
      }
    }
    if (response) {
      console.log(`${modeLabel[mode]}:`);
      console.log(marked.parse(response));
      chatHistory.push({ role: "assistant", content: response });
    } else {
      console.log(`${modeLabel[mode]}: (no output)`);
    }
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
  const stats2 = sysAgent.getStats();
  const total = stats2.vectorHits + stats2.webRequests;
  if (total > 0) {
    console.log(`[Cache: ${Math.round(stats2.vectorHits / total * 100)}% (${stats2.vectorHits}/${total})]`);
  }
  sysAgent.resetStats();
}
function handleMode(cmd) {
  const [, arg] = cmd.trim().split(/\s+/);
  if (!arg) {
    mode = mode === "probe" ? "rover" : "probe";
    console.log(`Switched to ${mode === "probe" ? "Probe" : "Rover"} mode`);
    return;
  }
  const modeArg = arg.toLowerCase();
  if (modeArg === "probe" || modeArg === "rover") {
    mode = modeArg;
    console.log(`Switched to ${mode === "probe" ? "Probe" : "Rover"} mode`);
    return;
  }
  console.log("Usage: /mode, /mode probe, /mode rover");
}
async function handleReset(cmd) {
  const [, arg] = cmd.trim().split(/\s+/);
  const actions = {
    db: () => sysAgent.resetVectorDB().then(() => "Vector DB cleared."),
    prompts: () => (sysAgent.resetPrompts(), "Prompts reset."),
    all: () => sysAgent.resetVectorDB().then(() => (sysAgent.resetPrompts(), "All reset."))
  };
  if (actions[arg]) {
    const msg = await actions[arg]();
    console.log(msg);
  } else {
    console.log("Usage: /reset [db|prompts|all]");
  }
}
async function handleServe(cmd) {
  if (_serverProcess) {
    console.log(dim("API server is already running."));
    return;
  }
  const [, portStr] = cmd.trim().split(/\s+/);
  const port = portStr || process.env.API_PORT || process.env.PORT || "3456";
  const env = { ...process.env, PORT: port };
  try {
    _serverProcess = spawn("node", [serverEntry], { env, stdio: "inherit" });
    console.log(`API server starting on port ${port}\u2026`);
    _serverProcess.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        console.log(dim(`API server exited with code ${code}`));
      }
      _serverProcess = null;
    });
  } catch (e) {
    console.log(`Failed to start API server: ${e.message}`);
  }
}
function handleStop() {
  if (!_serverProcess) {
    console.log(dim("API server is not running."));
    return;
  }
  _serverProcess.kill("SIGTERM");
  _serverProcess = null;
  console.log(dim("API server stopped."));
}
var blue = (s) => C(34, s);
console.log(blue("\u2500".repeat(64)));
console.log(bold("Wikipedia Agent"));
console.log();
console.log("  Ask questions no one ever asked");
console.log();
console.log(blue("Commands"));
console.log(dim("  /mode            Switch between probe (fast) and rover (in-depth)"));
console.log(dim("  /mode probe       Direct search with Wikipedia tools"));
console.log(dim("  /mode rover       Full pipeline: compose \u2192 search \u2192 refine"));
console.log(dim("  /serve [port]     Start the OpenAI-compatible API server"));
console.log(dim("  /stop             Stop the API server"));
console.log(dim("  /reset            Clear vector database, prompts, or all"));
console.log(dim("  /reset db          Delete cached Wikipedia content"));
console.log(dim("  /reset prompts     Restore prompts to default"));
console.log(dim("  /exit              Exit"));
console.log();
process.on("SIGINT", () => {
  if (_serverProcess) {
    _serverProcess.kill("SIGTERM");
    _serverProcess = null;
  }
  console.log(dim("\nGoodbye!"));
  rl.close();
  process.exit(0);
});
(async () => {
  for (; ; ) {
    const input = (await ask()).trim();
    if (!input) continue;
    const cmd = input.toLowerCase();
    if (cmd === "/exit") {
      if (_serverProcess) {
        _serverProcess.kill("SIGTERM");
        _serverProcess = null;
      }
      console.log(dim("Goodbye!"));
      break;
    }
    if (cmd.startsWith("/mode")) {
      handleMode(input);
      continue;
    }
    if (cmd === "/stop") {
      handleStop();
      continue;
    }
    if (cmd.startsWith("/serve")) {
      await handleServe(input);
      continue;
    }
    if (cmd.startsWith("/reset")) {
      await handleReset(input);
      continue;
    }
    await runQuery(input);
  }
  rl.close();
  process.exit(0);
})();
//# sourceMappingURL=cli.js.map
