/**
 * Cache statistics tracker for EVPAgent
 * 
 * Tracks vector cache hits vs web requests to calculate cache hit rate.
 * Stats are accumulated per response and logged after each response.
 */

// ============================================================================
// In-memory stats storage (reset between responses)
// ============================================================================

let stats = {
  vectorHits: 0,
  webRequests: 0,
  responseCount: 0,
};

// ============================================================================
// Record functions - called by tools during execution
// ============================================================================

/**
 * Record a vector cache hit
 * @param {'search'|'page'|'section'} type - The type of operation
 */
export function recordVectorHit(type = 'unknown') {
  stats.vectorHits++;
}

/**
 * Record a web request (cache miss)
 * @param {'search'|'page'|'section'} type - The type of operation
 */
export function recordWebRequest(type = 'unknown') {
  stats.webRequests++;
}

/**
 * Record a unique query for tracking
 * @param {string} query - The search query
 */
export function recordQuery(query) {}

/**
 * Record a cached article for tracking
 * @param {string} article - The article title
 */
export function recordArticle(article) {}

// ============================================================================
// Getter - returns current stats object
// ============================================================================

/**
 * Get current stats
 * @returns {Object} Current stats snapshot
 */
export function getStats() {
  return { ...stats };
}

// ============================================================================
// Format report for logging
// ============================================================================

/**
 * Format stats as a readable report string
 * @returns {string} Formatted stats report
 */
export function formatStatsReport() {
  const total = stats.vectorHits + stats.webRequests;
  if (total === 0) return '';
  
  const hitRate = Math.round((stats.vectorHits / total) * 100);
  
  return `[Cache hit rate: ${hitRate}% (${stats.vectorHits}/${total} requests)]`;
}

// ============================================================================
// Reset - called after logging (per-response stats)
// ============================================================================

/**
 * Reset per-response stats (keeps session totals)
 * Call this after logging stats at the end of a response
 */
export function resetResponseStats() {
  stats.responseCount++;
  stats.vectorHits = 0;
  stats.webRequests = 0;
}

/**
 * Full reset - clears all stats including session
 */
export function resetAllStats() {
  stats = {
    vectorHits: 0,
    webRequests: 0,
    responseCount: 0,
  };
}