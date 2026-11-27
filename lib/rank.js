/**
 * Reciprocal-rank fusion with URL deduplication.
 *
 * Engines disagree about ranking, so no engine's absolute score is trusted;
 * only its position inside its own list. A hit found by several engines is
 * boosted, and the longest snippet wins because engines that return a stub
 * snippet (or none) should not erase a useful one.
 */

import { canonicalUrl } from './html.js'

const RRF_K = 60

/**
 * @param {Array<{engine: string, results: Array<{title: string, url: string, snippet?: string}>}>} groups
 * @param {object} [options]
 * @param {number} [options.maxResults]
 * @param {Record<string, number>} [options.weights]
 * @returns {{results: Array<{title: string, url: string, snippet: string, engines: string[]}>, total: number}}
 */
export function fuse(groups, { maxResults = 8, weights = {} } = {}) {
  const merged = new Map()

  for (const group of groups) {
    const weight = Number.isFinite(weights[group.engine]) ? weights[group.engine] : 1
    group.results.forEach((item, index) => {
      const key = canonicalUrl(item.url)
      if (key === null) return

      const score = weight / (RRF_K + index + 1)
      const snippet = typeof item.snippet === 'string' ? item.snippet : ''

      const existing = merged.get(key)
      if (existing === undefined) {
        merged.set(key, {
          title: item.title,
          url: item.url,
          snippet,
          score,
          engines: new Set([group.engine]),
        })
        return
      }

      existing.score += score
      existing.engines.add(group.engine)
      if (snippet.length > existing.snippet.length) existing.snippet = snippet
    })
  }

  const ranked = [...merged.values()].sort((a, b) => b.score - a.score)
  return {
    results: ranked.slice(0, maxResults).map((item) => ({
      title: item.title,
      url: item.url,
      snippet: item.snippet,
      engines: [...item.engines],
    })),
    total: ranked.length,
  }
}
