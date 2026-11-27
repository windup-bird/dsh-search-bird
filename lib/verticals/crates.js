/**
 * crates.io search, coding vertical.
 *
 * crates.io asks clients to identify themselves with a descriptive User-Agent,
 * which this engine sends on top of the shared browser default.
 */

import { truncate } from '../html.js'

export default {
  id: 'crates',
  prefix: 'crate',
  label: 'crates.io',
  description: 'Rust crates by name or keyword',

  buildUrl(query) {
    const url = new URL('https://crates.io/api/v1/crates')
    url.searchParams.set('q', query)
    url.searchParams.set('per_page', '8')
    return url.href
  },

  headers: {
    'User-Agent': 'search-bird/0.1 (dsh web-search plugin)',
  },

  parse(text) {
    const data = JSON.parse(text)
    const crates = Array.isArray(data.crates) ? data.crates : []
    return crates.map((item) => {
      const version = item.max_version === undefined ? '' : `v${item.max_version}`
      const downloads = Number(item.downloads) || 0
      const description = typeof item.description === 'string' ? item.description : ''
      const facts = [version, `↓${downloads.toLocaleString('en-US')}`].filter((part) => part !== '')
      return {
        title: String(item.name),
        url: `https://crates.io/crates/${item.name}`,
        snippet: truncate([...facts, description].filter((part) => part !== '').join(' · '), 260),
        publishedAt: typeof item.updated_at === 'string' ? item.updated_at : undefined,
      }
    })
  },
}
