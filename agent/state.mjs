import { Annotation, messagesStateReducer } from "@langchain/langgraph";


/**
 * Defines the state contains what data, like chat history
 */
export const AgentState = Annotation.Root({
    // Chat history
    messages: Annotation({
        reducer: messagesStateReducer,
        default: () => [],
    })
})