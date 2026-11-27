/**
 * Bing, mainland endpoint over RSS.
 *
 * The RSS form of `cn.bing.com/search` is far cheaper and far more stable than
 * its HTML: one small XML document, real result URLs, and no bot wall. It is
 * the primary engine of this provider.
 */

import { textOf, truncate, unwrapCdata } from '../html.js'

const ENDPOINT = 'https://cn.bing.com/search'

export default {
  id: 'bing',
  label: 'Bing',
  region: 'cn',
  defaultEnabled: true,

  buildUrl(query, { language } = {}) {
    const url = new URL(ENDPOINT)
    url.searchParams.set('q', query)
    url.searchParams.set('format', 'rss')
    url.searchParams.set('count', '10')
    if (typeof language === 'string' && language !== '') {
      url.searchParams.set('setlang', language.split('-')[0])
    }
    return url.href
  },

  parse(text) {
    const results = []
    for (const match of text.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
      const item = unwrapCdata(match[1])
      const field = (tag) => {
        const found = item.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'))
        return found === null ? '' : textOf(found[1])
      }
      const url = field('link')
      if (url === '') continue
      const title = field('title')
      if (title === '') continue
      results.push({ title, url, snippet: truncate(field('description'), 280) })
    }
    return results
  },
}
