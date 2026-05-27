import { StateGraph } from "@langchain/langgraph";
import { AgentState } from "./state.mjs";
import { callModel } from "./agent.mjs";
import { toolNode } from "./tools/index.mjs";
import { START, END } from "@langchain/langgraph";


/**
 * Defines the MainAgent langGraph workflow.
 * Flow: START -> agent -> (tools -> agent)* -> END
 */
export const mainGraph = new StateGraph(AgentState)
                            .addNode("agent", callModel)
                            .addNode("tools", toolNode)
                            .addEdge(START, "agent")
                            .addConditionalEdges("agent", (state) => {
                                const lastMessage = state.messages?.[state.messages.length - 1];
                                
                                // "tools", if there are tool_calls
                                if (lastMessage?.tool_calls?.length > 0) {
                                    return "tools";
                                }

                                // END - when no more tool calls
                                return END;
                            })
                            .addEdge("tools", "agent")
                            .compile();





                        
