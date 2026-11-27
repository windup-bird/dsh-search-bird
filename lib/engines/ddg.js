/**
 * DuckDuckGo Lite, global route.
 *
 * The Lite front end is a plain table with no JavaScript, so it parses with the
 * same regex approach as the HTML engines. It is unreachable from mainland
 * China without a proxy, which is why the provider only tries it when the
 * configured proxy is reachable.
 */

import { absolutize, textOf, truncate } from '../html.js'

const ENDPOINT = 'https://lite.duckduckgo.com/lite/'

/** Decode DuckDuckGo's link wrapper into the destination URL. */
function unwrap(href, pageUrl) {
  const absolute = absolutize(href, pageUrl)
  if (absolute === null) return null
  try {
    const url = new URL(absolute)
    if (!url.hostname.endsWith('duckduckgo.com')) return absolute
    const target = url.searchParams.get('uddg')
    return target === null ? null : target
  } catch {
    return null
  }
}

export default {
  id: 'ddg',
  label: 'DuckDuckGo',
  region: 'global',
  defaultEnabled: true,

  buildUrl(query) {
    const url = new URL(ENDPOINT)
    url.searchParams.set('q', query)
    return url.href
  },

  parse(html, { url: pageUrl = ENDPOINT } = {}) {
    const results = []
    let current = null

    for (const cell of html.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)) {
      const attributes = cell[1]
      const body = cell[2]

      if (/class="[^"]*result-link[^"]*"/i.test(attributes)) {
        const anchor = body.match(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
        if (anchor === null) {
          current = null
          continue
        }
        const url = unwrap(anchor[1], pageUrl)
        const title = textOf(anchor[2])
        if (url === null || title === '') {
          current = null
          continue
        }
        current = { title, url, snippet: '' }
        results.push(current)
        continue
      }

      if (current !== null && /class="[^"]*result-snippet[^"]*"/i.test(attributes)) {
        const snippet = truncate(textOf(body), 280)
        if (snippet !== '') current.snippet = snippet
      }
    }
    return results
  },
}
