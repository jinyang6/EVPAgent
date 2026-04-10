import 'dotenv/config';
import { StateGraph } from "@langchain/langgraph";
import { AgentState } from "./state.mjs";
import { callModel } from "../llm/agent.mjs";
import { toolNode } from "../tools/index.mjs";
import { START, END } from "@langchain/langgraph";


/**
 * Defines the langGraph workflow.
 * 
 * IMPORTANT:
 * 1. Define the nodes first then edges!
 */
export const workflow = new StateGraph(AgentState)
                            .addNode("agent", callModel)
                            .addNode("tools", toolNode)
                            .addEdge(START, "agent")
                            .addConditionalEdges("agent", (state) => {
                                /**
                                 * The function(silent) defines
                                 * conditional edges out of the "agent" node.
                                 * 
                                 * TODO:
                                 * Add more edges here!
                                 */
                                const messages = state.messages
                                const lastMessage = messages[messages.length - 1]
                                const toolCalls = ("tool_calls" in lastMessage) ? lastMessage.tool_calls : []
                                
                                // "tools", if there are tool_calls
                                if (toolCalls.length > 0) {
                                    return "tools"
                                }

                                // END, If nothing is left to do
                                return END
                            })
                            .addEdge("tools", "agent")
                            .compile();





                        
