import { Annotation, messagesStateReducer } from "@langchain/langgraph";

/**
 * Refine state - uses messagesStateReducer for chat history
 */
export const RefineState = Annotation.Root({
    messages: Annotation({
        reducer: messagesStateReducer,
        default: () => [],
    })
})