import { Annotation, messagesStateReducer } from "@langchain/langgraph";

/**
 * SysAgent state
 */
export const SysState = Annotation.Root({
    messages: Annotation({
        reducer: messagesStateReducer,
        default: () => [],
    })
})