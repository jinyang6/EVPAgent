import { StateGraph } from "@langchain/langgraph";
import { ComposerState } from "./state.mjs";
import { callModel } from "./agent.mjs";
import { toolNode } from "./tools/index.mjs";
import { START, END } from "@langchain/langgraph";

/**
 * Defines the PromptComposerAgent langGraph workflow.
 * Flow: START -> agent -> tools -> agent -> ... -> END
 * 
 * Ends when:
 * 1. Agent returns a message without tool_calls (natural end)
 * 2. OR after combinePrompts is called and returns
 */
export const composerGraph = new StateGraph(ComposerState)
                            .addNode("agent", callModel)
                            .addNode("tools", toolNode)
                            .addEdge(START, "agent")
                            .addConditionalEdges("agent", (state) => {
                                const messages = state.messages;
                                const lastMessage = messages[messages.length - 1];
                                
                                // If last message has tool_calls, run tools
                                if (lastMessage?.tool_calls?.length > 0) {
                                    return "tools";
                                }
                                
                                // No tool_calls means the agent is done
                                return END;
                            })
                            .addEdge("tools", "agent")
                            .compile();