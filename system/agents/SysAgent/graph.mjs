import { StateGraph } from "@langchain/langgraph";
import { SysState } from "./state.mjs";
import { callModel } from "./agent.mjs";
import { START, END } from "@langchain/langgraph";


/**
 * Defines the SysAgent orchestrator workflow.
 * Simple flow: START -> agent -> END
 */
export const sysGraph = new StateGraph(SysState)
                            .addNode("agent", callModel)
                            .addEdge(START, "agent")
                            .addEdge("agent", END)
                            .compile();