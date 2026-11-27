/**
 * A tiny bounded cache for search results.
 *
 * The tool merges several queries per call and the same query often repeats
 * across turns; a short TTL keeps those off the network without pretending the
 * index is fresh.
 */

export class SearchCache {
  #entries = new Map()
  #ttlMs
  #max

  constructor({ ttlMs = 300_000, max = 200 } = {}) {
    this.#ttlMs = ttlMs
    this.#max = max
  }

  get(key) {
    const hit = this.#entries.get(key)
    if (hit === undefined) return undefined
    if (Date.now() - hit.at >= this.#ttlMs) {
      this.#entries.delete(key)
      return undefined
    }
    // Refresh recency so the bound evicts the coldest entry.
    this.#entries.delete(key)
    this.#entries.set(key, hit)
    return hit.value
  }

  set(key, value) {
    this.#entries.delete(key)
    this.#entries.set(key, { at: Date.now(), value })
    while (this.#entries.size > this.#max) {
      const oldest = this.#entries.keys().next()
      if (oldest.done === true) break
      this.#entries.delete(oldest.value)
    }
  }

  get size() {
    return this.#entries.size
  }

  clear() {
    this.#entries.clear()
  }
}
