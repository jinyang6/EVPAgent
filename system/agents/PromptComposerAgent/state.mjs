import { Annotation, messagesStateReducer } from "@langchain/langgraph";

/**
 * Composer state - uses messagesStateReducer for chat history
 */
export const ComposerState = Annotation.Root({
    messages: Annotation({
        reducer: messagesStateReducer,
        default: () => [],
    }),
    combineDone: Annotation({
        reducer: (current, update) => current || update,
        default: () => false,
    })
})