#!/usr/bin/env node

/**
 * Minimal LangGraph agent with ChatOpenRouter + one tool.
 *
 * Usage: node tests/test_agent/index.mjs ["your question"]
 */

process.env.HTTP_PROXY = 'http://127.0.0.1:33210';
process.env.HTTPS_PROXY = 'http://127.0.0.1:33210';

import 'dotenv/config';
import { StateGraph, START, END } from "@langchain/langgraph";
import { Annotation, messagesStateReducer } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

// ── Tool ──────────────────────────────────────────────────────────────────────

const calculator = tool(
  async ({ expression }) => {
    try {
      const sanitized = expression.replace(/[^0-9+\-*/().%\s]/g, "");
      const result = Function(`"use strict"; return (${sanitized})`)();
      return `${expression} = ${result}`;
    } catch {
      return `Could not evaluate "${expression}"`;
    }
  },
  {
    name: "calculator",
    description: "Evaluate a math expression. Use for arithmetic.",
    schema: z.object({
      expression: z.string().describe("Math expression, e.g. '2 + 3 * 4'"),
    }),
  }
);

const toolNode = new ToolNode([calculator]);

// ── State ─────────────────────────────────────────────────────────────────────

const AgentState = Annotation.Root({
  messages: Annotation({ reducer: messagesStateReducer, default: () => [] }),
});

// ── LLM node ──────────────────────────────────────────────────────────────────
console.log(process.env.SEARCH_MODEL_ID, process.env.SEARCH_MODEL_API_KEY, process.env.SEARCH_MODEL_BASE_URL)
const model = new ChatOpenAI({
        model: process.env.SEARCH_MODEL_ID,
        apiKey: process.env.SEARCH_MODEL_API_KEY,
        configuration: {
            baseURL: process.env.SEARCH_MODEL_BASE_URL,
            defaultHeaders: {
                "HTTP-Referer": "https://github.com/jinyang6/EVPAgent",
                "X-Title": "EVPAgent"
            }
        }
    }).bindTools([calculator]);

async function callModel(state) {
  const messages = [
    { role: "system", content: "You are a helpful assistant. Use the calculator tool for math. Be concise." },
    ...state.messages,
  ];
  const response = await model.invoke(messages);
  return { messages: [response] };
}

// ── Graph ─────────────────────────────────────────────────────────────────────

const graph = new StateGraph(AgentState)
  .addNode("agent", callModel)
  .addNode("tools", toolNode)
  .addEdge(START, "agent")
  .addConditionalEdges("agent", (state) => {
    const last = state.messages[state.messages.length - 1];
    return last?.tool_calls?.length ? "tools" : END;
  })
  .addEdge("tools", "agent")
  .compile();

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const query = process.argv[2] || "What is 2 + 3 * 4?";

  console.log("=== Test Agent ===");
  console.log(`Model: ${process.env.SEARCH_MODEL_ID || "openai/gpt-4o-mini"}`);
  console.log(`Query: ${query}`);
  console.log("─".repeat(40));

  try {
    const stream = await graph.stream(
      { messages: [{ role: "user", content: query }] },
      { recursionLimit: 10 }
    );

    for await (const chunk of stream) {
      for (const [node, state] of Object.entries(chunk)) {
        const msgs = state?.messages ?? [];
        const last = msgs[msgs.length - 1];

        if (node === "agent" && last?.tool_calls?.length) {
          for (const tc of last.tool_calls) {
            console.log(`  → ${tc.name}(${JSON.stringify(tc.args)})`);
          }
        } else if (node === "agent" && last?.content) {
          console.log(`  ${last.content}`);
        } else if (node === "tools" && last?.content) {
          console.log(`  ← ${last.content.slice(0, 200)}`);
        }
      }
    }

    console.log("─".repeat(40));
    console.log("Done.");
  } catch (error) {
    console.error("\nError:", error.message);
    process.exit(1);
  }
}

main();
