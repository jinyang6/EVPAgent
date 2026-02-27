# LangGraph framework




```javascript
export function callModel(state, config) {

    return {
        messages: [
            {
                role: "assistant",
                content: "How are you doing?",
                thinking: "I need to response with nice tone.",
                tool_calls: [] // empty tool call array placeholder
            }
        ]
    }
};
```