/**
 * Google, global route, off by default.
 *
 * Google's result markup changes often and its bot wall is aggressive, so this
 * engine is best-effort: it pairs every anchor that wraps a heading with the
 * text that follows it, and drops anything it cannot classify. Enable it only
 * with a working proxy.
 */

import { absolutize, decodeEntities, textOf, truncate } from '../html.js'

const ENDPOINT = 'https://www.google.com/search'

/** Turn `/url?q=…` and `…&amp;…` forms into a real destination. */
function destination(href, pageUrl) {
  const decoded = decodeEntities(href)
  if (decoded.startsWith('/url?')) {
    try {
      const target = new URL(decoded, pageUrl).searchParams.get('q')
      return target === null ? null : absolutize(target, pageUrl)
    } catch {
      return null
    }
  }
  const absolute = absolutize(decoded, pageUrl)
  if (absolute === null) return null
  try {
    const host = new URL(absolute).hostname
    if (host === 'www.google.com' || host.endsWith('.google.com')) return null
  } catch {
    return null
  }
  return absolute
}

export default {
  id: 'google',
  label: 'Google',
  region: 'global',
  defaultEnabled: false,

  buildUrl(query, { language } = {}) {
    const url = new URL(ENDPOINT)
    url.searchParams.set('q', query)
    url.searchParams.set('num', '10')
    if (typeof language === 'string' && language !== '') {
      url.searchParams.set('hl', language)
    }
    return url.href
  },

  parse(html, { url: pageUrl = ENDPOINT } = {}) {
    const results = []
    const seen = new Set()
    const pattern = /<a\b[^>]*href="([^"]+)"[^>]*>[\s\S]{0,400}?<h3[^>]*>([\s\S]*?)<\/h3>/gi

    for (const match of html.matchAll(pattern)) {
      const url = destination(match[1], pageUrl)
      const title = textOf(match[2])
      if (url === null || title === '' || seen.has(url)) continue
      seen.add(url)

      const tailStart = (match.index ?? 0) + match[0].length
      const snippet = truncate(textOf(html.slice(tailStart, tailStart + 1200)), 240)
      results.push({ title, url, snippet })
    }
    return results
  },
}
