import { tool } from "@langchain/core/tools";
import z from "zod";
import { SysAgent } from "../../../SysAgent/index.mjs";

/**
 * deepSearch — Launch the full rover pipeline as a subagent.
 *
 * When the probe-mode LLM needs deeper investigation, it calls this tool.
 * Internally runs compose → search → refine and returns the final report.
 */
export const deepSearchTool = tool(
  async ({ query }, config) => {
    const apiKey = config?.configurable?.apiKey || null;
    const rover = new SysAgent({ apiKey });
    let result = "";
    for await (const chunk of rover.stream(
      [{ role: "user", content: query }],
      "rover",
      { signal: config?.signal }
    )) {
      const content = chunk?.choices?.[0]?.delta?.content;
      if (content) result = content;
    }

    if (result) {
      rover.resetSession();
      return result;
    }

    const success = rover.wasSearchSuccessful();
    rover.resetSession();
    return success
      ? "Search succeeded but no report was generated."
      : "Search failed. No report was generated.";
  },
  {
    name: "deepSearch",
    description:
      `Deep search a complex question that requires combining information from multiple sources into a formal report.

When to use:
- Use when the question demands a comprehensive, structured report with specific requirements
- Use for focused, academically-oriented topics that need formal research synthesis
- Use when the answer requires cross-referencing multiple Wikipedia articles or external sources

When NOT to use:
- Do NOT use for broad, open-ended topics or casual curiosity
- Do NOT use for simple fact lookups (e.g., "What year was X founded?")
- Do NOT use when a single Wikipedia article section would suffice

This launches the full rover pipeline (compose plan → multi-step search → refine prompts), which is slow but produces a thorough, citation-backed report. Reserve it for questions that genuinely require depth over speed.

Parameters:
- query (required): A specific, well-scoped research question. Should be precise and academic in nature (e.g., "How did Streamline Moderne architecture influence mid-century automotive design?") rather than broad or vague (e.g., "Tell me about cars").

Returns: A comprehensive Markdown report synthesizing findings from multiple sources.`,
    schema: z.object({
      query: z.string().describe(
        "A specific, well-defined research question requiring formal investigation across multiple sources. Should be focused and academic, not a broad or casual query."
      ),
    }),
  }
);
