import { StateGraph } from "@langchain/langgraph";
import { RefineState } from "./state.mjs";
import { callModel } from "./agent.mjs";
import { toolNode } from "./tools/index.mjs";
import { START, END } from "@langchain/langgraph";


/**
 * Defines the PromptRefineAgent langGraph workflow.
 * Flow: START -> agent -> (tools -> agent)* -> END
 */
export const refineGraph = new StateGraph(RefineState)
                            .addNode("agent", callModel)
                            .addNode("tools", toolNode)
                            .addEdge(START, "agent")
                            .addConditionalEdges("agent", (state) => {
                                const messages = state.messages;
                                const lastMessage = messages[messages.length - 1];
                                const toolCalls = ("tool_calls" in lastMessage) ? lastMessage.tool_calls : [];
                                
                                // "tools", if there are tool_calls
                                if (toolCalls.length > 0) {
                                    return "tools";
                                }

                                // END, if no more tool calls
                                return END;
                            })
                            .addEdge("tools", "agent")
                            .compile();