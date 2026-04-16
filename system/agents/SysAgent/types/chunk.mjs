/**
 * OpenAI-compatible chunk types for SysAgent streaming output
 *
 * Standard formats:
 * - Text delta: { choices: [{ delta: { content: "..." }, index: 0 }] }
 * - Tool call:  { choices: [{ delta: { tool_calls: [{ id, name, args }] }, index: 0 }] }
 * - Done:       { choices: [{ delta: {}, finish_reason: "stop" }] }
 */

let toolCounter = 0;

/**
 * Create a text content chunk
 * @param {string} content
 * @param {number} index
 * @returns {Object}
 */
export function textChunk(content, index = 0) {
  return {
    choices: [{ delta: { content }, index }],
  };
}

/**
 * Create a tool call chunk
 * @param {string} name - Tool name
 * @param {Object} args - Tool arguments
 * @param {number} index
 * @returns {Object}
 */
export function toolChunk(name, args = {}, index = 0) {
  return {
    choices: [{
      delta: {
        tool_calls: [{
          id: `tool_${++toolCounter}`,
          name,
          args,
        }],
      },
      index,
    }],
  };
}

/**
 * Create a done chunk
 * @param {number} index
 * @returns {Object}
 */
export function doneChunk(index = 0) {
  return {
    choices: [{ delta: {}, finish_reason: "stop", index }],
  };
}

/**
 * Check if value is a non-empty string
 * @param {any} val
 * @returns {boolean}
 */
export function isNonEmptyString(val) {
  return typeof val === "string" && val.length > 0;
}
