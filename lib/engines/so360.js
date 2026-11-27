/**
 * 360 Search (so.com), mainland direct.
 *
 * Each organic hit is a `li.res-list`; the real destination sits in the
 * `data-mdurl` attribute, so no redirect resolution is needed.
 */

import { decodeEntities, textOf, truncate } from '../html.js'

const ENDPOINT = 'https://www.so.com/s'

export default {
  id: 'so360',
  label: '360 Search',
  region: 'cn',
  defaultEnabled: true,

  buildUrl(query, { page = 1 } = {}) {
    const url = new URL(ENDPOINT)
    url.searchParams.set('q', query)
    url.searchParams.set('pn', String(page))
    return url.href
  },

  parse(html) {
    const results = []
    for (const match of html.matchAll(/<li[^>]*class="[^"]*res-list[^"]*"([\s\S]*?)(?=<\/li>|<li[^>]*class="[^"]*res-list|$)/gi)) {
      const block = match[1]
      const target = block.match(/data-mdurl="(https?:\/\/[^"]+)"/i)
      if (target === null) continue
      const heading = block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)
      if (heading === null) continue

      const title = textOf(heading[1])
      const url = decodeEntities(target[1])
      if (title === '' || url === '') continue

      const summary = block.match(
        /class="[^"]*(?:res-desc|res-comm-con|summary|mh-abstract)[^"]*"[^>]*>([\s\S]*?)<\/(?:p|div|span)>/i,
      )
      const snippet = summary === null ? '' : truncate(textOf(summary[1]), 280)
      results.push({ title, url, snippet })
    }
    return results
  },
}
