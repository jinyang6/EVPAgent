// ============================================================================
// Text Chunking for ChromaDB Storage
// Based on ChromaDB best practices: https://docs.trychroma.com/guides/build/chunking
// ============================================================================

// Constants for chunking (per ChromaDB best practices)
const CHUNK_SIZE = 500; // characters
const CHUNK_OVERLAP = 50; // characters overlap between chunks

// Separators tried in order (from largest to smallest unit)
const SEPARATORS = ["\n\n", "\n", ". ", " "];

// ============================================================================
// Recursive Character Text Splitter
// ============================================================================

/**
 * Split text into chunks using a simple sliding window approach
 * that respects word boundaries.
 *
 * @param {string} text - The text to split
 * @param {number} chunkSize - Maximum characters per chunk (default 500)
 * @param {number} chunkOverlap - Overlap between chunks in chars (default 50)
 * @returns {string[]} Array of text chunks
 */
export function splitText(
  text,
  chunkSize = CHUNK_SIZE,
  chunkOverlap = CHUNK_OVERLAP
) {
  if (!text || text.length === 0) {
    return [];
  }

  // If text is small enough, return as single chunk
  if (text.length <= chunkSize) {
    return [text];
  }

  const chunks = [];
  let startIndex = 0;

  while (startIndex < text.length) {
    // Calculate end index for this chunk
    let endIndex = startIndex + chunkSize;

    // If we're not at the end, try to break at a word boundary
    if (endIndex < text.length) {
      // Look backwards from endIndex to find a space
      let breakPoint = -1;

      for (let i = endIndex; i > Math.max(startIndex, endIndex - 100); i--) {
        if (text[i] === ' ' || text[i] === '\n' || text[i] === '\t') {
          breakPoint = i;
          break;
        }
      }

      // If we found a break point, use it
      if (breakPoint > startIndex) {
        endIndex = breakPoint;
      }
      // Otherwise, we'll break mid-word (acceptable for edge cases)
    }

    // Extract the chunk
    const chunk = text.slice(startIndex, endIndex).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    // Move start index with overlap
    // If we broke at a word boundary, include some trailing context
    if (endIndex < text.length) {
      startIndex = endIndex;
      // If we have overlap and aren't at the end, back up a bit for context
      if (chunkOverlap > 0 && startIndex + chunkOverlap < text.length) {
        // Find a good break point for overlap
        let overlapStart = startIndex;
        for (let i = startIndex + chunkOverlap; i > startIndex; i--) {
          if (text[i] === ' ' || text[i] === '\n') {
            overlapStart = i + 1;
            break;
          }
        }
        startIndex = overlapStart;
      }
    } else {
      break;
    }
  }

  return chunks.filter((chunk) => chunk.length > 0);
}

// ============================================================================
// Alternative: Simple fixed-size chunking with word boundary awareness
// ============================================================================

/**
 * Simple chunking that respects word boundaries.
 * Splits at spaces near chunkSize rather than in middle of words.
 *
 * @param {string} text - Text to chunk
 * @param {number} chunkSize - Max chars per chunk (default 500)
 * @param {number} chunkOverlap - Overlap chars (default 50)
 * @returns {string[]} Array of chunks
 */
export function simpleChunk(
  text,
  chunkSize = CHUNK_SIZE,
  chunkOverlap = CHUNK_OVERLAP
) {
  if (!text || text.length === 0) {
    return [];
  }

  if (text.length <= chunkSize) {
    return [text];
  }

  const chunks = [];
  let start = 0;

  while (start < text.length) {
    // Find the end position for this chunk
    let end = start + chunkSize;

    // If not at the end, try to break at word boundary
    if (end < text.length) {
      // Look for space before chunkSize
      let breakPoint = text.lastIndexOf(" ", end);

      // If no space found in reasonable range, look after
      if (breakPoint <= start) {
        breakPoint = text.indexOf(" ", end);
      }

      // If still no space found, just cut at chunkSize (rare case)
      if (breakPoint === -1 || breakPoint === start) {
        breakPoint = Math.min(start + chunkSize, text.length);
      }

      end = breakPoint;
    }

    // Extract chunk
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    // Move start with overlap
    start = end;
    // Ensure we're not stuck (handle edge case of single long word)
    if (start <= chunks.length * chunkSize - chunkSize) {
      start = Math.min(end + 1, text.length);
    }
  }

  return chunks;
}

// ============================================================================
// Utility: Get chunk count info
// ============================================================================

/**
 * Get info about how text would be chunked without actually chunking
 * @param {string} text - Text to analyze
 * @param {number} chunkSize - Chunk size to use
 * @returns {object} Info object with count and sizes
 */
export function getChunkingInfo(text, chunkSize = CHUNK_SIZE) {
  const chunks = splitText(text, chunkSize);

  return {
    chunkCount: chunks.length,
    chunkSize: chunkSize,
    originalLength: text.length,
    averageChunkSize: chunks.length > 0
      ? Math.round(chunks.reduce((sum, c) => sum + c.length, 0) / chunks.length)
      : 0,
    sizes: chunks.map((c) => c.length),
  };
}
