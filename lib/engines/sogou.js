/**
 * Sogou, mainland direct.
 *
 * Result links are usually `www.sogou.com/link?url=…`, which answers with a
 * 192-byte stub carrying the destination in `window.location.replace("…")`.
 * The parser marks those hits with `needsResolve` and the provider performs the
 * extra hop, dropping links that cannot be resolved.
 */

import { absolutize, textOf, truncate } from '../html.js'

const ENDPOINT = 'https://www.sogou.com/web'

export default {
  id: 'sogou',
  label: 'Sogou',
  region: 'cn',
  // Sogou starts answering with an anti-bot page after a few requests from one
  // address, so it ships implemented but off until a user opts in.
  defaultEnabled: false,

  buildUrl(query, { page = 1 } = {}) {
    const url = new URL(ENDPOINT)
    url.searchParams.set('query', query)
    if (page > 1) url.searchParams.set('page', String(page))
    return url.href
  },

  parse(html, { url: pageUrl = ENDPOINT } = {}) {
    const results = []
    const blockPattern = /<div[^>]*class="[^"]*vrwrap[^"]*"([\s\S]*?)(?=<div[^>]*class="[^"]*vrwrap|$)/gi

    for (const match of html.matchAll(blockPattern)) {
      const block = match[1]
      const heading = block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)
      if (heading === null) continue
      const anchor = heading[1].match(/href="([^"]+)"/i) ?? block.match(/<a[^>]*href="(https?:\/\/[^"]+)"/i)
      if (anchor === null) continue

      const title = textOf(heading[1])
      const url = absolutize(anchor[1], pageUrl)
      if (title === '' || url === null) continue

      const summary = block.match(
        /class="[^"]*(?:text-layout|star-wiki|space-txt|fz-mid|str_info)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|p|span)>/i,
      )
      const snippet = summary === null ? '' : truncate(textOf(summary[1]), 280)
      results.push({ title, url, snippet, needsResolve: /\/link\?url=/i.test(url) })
    }
    return results
  },

  /** Extract the destination from a Sogou redirect stub. */
  resolveFrom(text) {
    const script = text.match(/window\.location\.replace\("([^"]+)"\)/i)
    if (script !== null) return script[1]
    const meta = text.match(/URL='([^']+)'/i) ?? text.match(/URL=([^"'>\s]+)/i)
    return meta === null ? null : meta[1]
  },
}
