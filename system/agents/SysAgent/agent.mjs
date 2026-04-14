import { SysState } from "./state.mjs";
import { START, END } from "@langchain/langgraph";

/**
 * SysAgent callModel - simple pass-through for graph compatibility
 */
export async function callModel(state, config) {
  return { messages: [{ role: "assistant", content: "SysAgent - orchestration handled by cli.jsx" }] };
}

/**
 * Defines the SysAgent orchestrator workflow.
 * Simple flow: START -> agent -> END
 */
export const sysGraph = new StateGraph(SysState)
                            .addNode("agent", callModel)
                            .addEdge(START, "agent")
                            .addEdge("agent", END)
                            .compile();