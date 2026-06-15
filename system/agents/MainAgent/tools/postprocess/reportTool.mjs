import { tool } from "@langchain/core/tools";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import z from "zod";
import { getUserPromptsDir, getOutputDir } from "../../../utils/appDataPaths.mjs";
import { fetchWikiImageInfo } from "../wikipedia/wikipediaHelpers.mjs";

/**
 * Get output file path
 */
function getOutputFile() {
  return join(getOutputDir(), "output.md");
}

/**
 * Map a file extension to a media category.
 *
 * Used by renderMedia to determine whether a file should be rendered as
 * <video>, <audio>, or <img>.
 *
 * @param {string} ext - File extension (with or without leading dot)
 * @returns {"video"|"audio"|"image"|"unknown"}
 *
 * @example
 *   getFileTypeFromFormat("ogv")   // "video"
 *   getFileTypeFromFormat(".MP3")  // "audio"
 *   getFileTypeFromFormat("svg")   // "image"
 *   getFileTypeFromFormat("abc")   // "unknown"
 */
function getFileTypeFromFormat(ext) {
  const format = ext.replace(/^\./, "").trim().toLowerCase();

  const formats = {
    video: ["ogv", "mp4", "webm", "avi", "mov", "mkv", "wmv"],
    audio: ["ogg", "mp3", "wav", "m4a", "flac", "aac", "oga", "opus"],
    image: ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "tiff", "tif"],
  };

  return Object.keys(formats).find((key) => formats[key].includes(format)) || "unknown";
}

/**
 * Render a media file as a centered, paper-style figure.
 *
 * Produces a <figure> with <img>, <video>, or <audio> and a <figcaption>
 * linking back to the Commons description page.
 *
 * When `description` is provided it is used as the primary caption (rich HTML
 * supplied by the agent); otherwise the file name serves as a plain-text fallback.
 *
 * Figure is centered at 70% max-width with small gray caption.
 * Audio players are constrained to 300px width.
 *
 * @param {{ title: string, url: string, descriptionurl: string }} info
 * @param {string} [description] - Optional HTML description from the agent
 * @returns {string} HTML block
 */
function renderMedia({ title, url, descriptionurl }, description) {
  const caption = description
    || title.replace(/^File:/, "").replace(/_/g, " ");
  const ext = url.match(/\.(\w+)$/i)?.[1] || "";
  const type = getFileTypeFromFormat(ext);

  const isVideo = type === "video";
  const isAudio = type === "audio";
  const isImage = type === "image";

  let mediaTag;
  if (isVideo) {
    mediaTag = `<video src="${url}" controls style="width:100%;height:auto;display:block;margin:0 auto"></video>`;
  } else if (isAudio) {
    mediaTag = `<audio src="${url}" controls style="display:block;width:300px;max-width:100%;margin:0 auto"></audio>`;
  } else if (isImage) {
    mediaTag = `<img src="${url}" style="width:100%;height:auto;display:block;margin:0 auto">`;
  } else {
    // Unknown MIME type — provide a download link instead
    mediaTag = `<a href="${url}" target="_blank" rel="noopener">Download ${caption}</a>`;
  }

  const credit =
    `<small>Source: <a href="${descriptionurl}" target="_blank" rel="noopener">Wikimedia</a></small>`;

  return [
    '<figure style="max-width:70%;margin:1.5em auto;text-align:center;overflow:hidden">',
    `  ${mediaTag}`,
    `  <figcaption style="margin-top:0.5em;font-size:0.9em;color:#555;text-align:left;word-break:break-word;overflow-wrap:break-word">`,
    `    ${caption}`,
    `    <br>${credit}`,
    `  </figcaption>`,
    "</figure>",
  ].join("\n");
}

/**
 * reportTool — Finalize the research session.
 *
 * Receives an ordered list of content items (Markdown sections and media files),
 * resolves media file titles to real URLs, renders them as inline HTML, and
 * writes the assembled article to output.md.
 */
export const reportTool = tool(
  async ({ searchSuccess, items }) => {
    const promptsDir = getUserPromptsDir();
    const manifestPath = join(promptsDir, "session_manifest.json");

    // Assemble article from items
    if (items && items.length > 0) {
      const outputDir = getOutputDir();
      const outputFile = getOutputFile();

      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }

      // Resolve all media items in parallel, then assemble in order.
      const mediaIndices = [];
      items.forEach((item, i) => {
        if (item.type === "media") mediaIndices.push(i);
      });

      const resolved = await Promise.all(
        mediaIndices.map((i) => fetchWikiImageInfo(items[i].content))
      );

      const parts = [];
      let ri = 0;
      for (const item of items) {
        if (item.type === "markdown") {
          parts.push(item.content);
        } else {
          const info = resolved[ri++];
          parts.push(info ? renderMedia(info, item.description) : `> Media not found: \`${item.content}\``);
        }
      }

      writeFileSync(outputFile, parts.join("\n\n"), "utf-8");
    }

    // Update manifest
    if (!existsSync(manifestPath)) {
      return "Error: session_manifest.json not found";
    }

    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
      manifest.searchSuccess = searchSuccess;
      manifest.timestamp = new Date().toISOString();
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

      const itemCount = items?.length || 0;
      const mediaCount = items?.filter(i => i.type === "media").length || 0;
      return `Report saved (${itemCount} items, ${mediaCount} media).`;
    } catch (error) {
      return `Error: ${error.message}`;
    }
  },
  {
    name: "report",
    description: `Finalize the research session and write the assembled article to output.md.

When to use:
- Call exactly ONCE at the end of every research session
- Call after you have gathered all content and are ready to produce the final article
- Must be called even if the search was unsuccessful (set searchSuccess: false)

Parameters:
- searchSuccess (required): Whether the search produced useful findings
- items (optional, default=[]): Ordered list of content blocks that form the article:
  - type "markdown": A section of the article in Markdown format
  - type "media": A Wikipedia/Commons file title (e.g., "BBH gravitational lensing of gw150914.webm").
    Optionally include a "description" field with an HTML caption for the media figure.
    When provided, this custom caption replaces the plain file-name fallback.

The tool resolves media file titles to real URLs via the Wikipedia API and
renders them as clean HTML figures with captions and source links. Markdown
sections are concatenated in order with media placed inline.

Returns: Confirmation message with item and media count.`,
    schema: z.object({
      searchSuccess: z.boolean().describe("Whether the search was successful"),
      items: z.array(z.object({
        type: z.enum(["markdown", "media"]).describe("Content type: 'markdown' for article text, 'media' for a file title"),
        content: z.string().describe("For markdown: article section in Markdown. For media: file title, e.g. 'Example.jpg' or 'BBH gravitational lensing of gw150914.webm'."),
        description: z.string().describe("Optional HTML description/caption for media items only (ignored for markdown). When provided, this replaces the plain file-name caption under the media figure. Use to supply a custom, informative caption tailored to the article context.").optional(),
      })).describe("Ordered list of content items that form the final article").optional().default([]),
    }),
  }
);
