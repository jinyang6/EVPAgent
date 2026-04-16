/**
 * File I/O utilities for SysAgent
 */

import { existsSync, readFileSync } from "fs";

/**
 * Read and parse JSON file
 * @param {string} path
 * @returns {Object|null}
 */
export function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Read text file, returns null if empty or missing
 * @param {string} path
 * @returns {string|null}
 */
export function readFile(path) {
  if (!existsSync(path)) return null;
  const content = readFileSync(path, "utf-8");
  return content.trim() || null;
}
