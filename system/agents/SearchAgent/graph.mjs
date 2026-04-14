import 'dotenv/config';
import { StateGraph } from "@langchain/langgraph";
import { AgentState } from "./state.mjs";
import { callModel } from "./agent.mjs";
import { toolNode } from "./tools/index.mjs";
import { START, END } from "@langchain/langgraph";


/**
 * Defines the langGraph workflow.
 * Flow: START -> agent -> tools -> agent -> ... -> END
 */
export const searchGraph = new StateGraph(AgentState)
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

                                // END - when no more tool calls
                                return END;
                            })
                            .addEdge("tools", "agent")
                            .compile();





                        
