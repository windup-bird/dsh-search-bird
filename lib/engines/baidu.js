/**
 * Baidu, mainland direct.
 *
 * Baidu's JSON endpoint (`tn=json`) now redirects to an anti-bot page, so this
 * parser reads the organic result containers: each `c-container` carries the
 * real destination in its `mu` attribute, which avoids resolving Baidu's
 * `www.baidu.com/link?url=` wrappers one by one.
 */

import { decodeEntities, textOf, truncate } from '../html.js'

const ENDPOINT = 'https://www.baidu.com/s'

const CONTAINER = /<div[^>]*class="[^"]*c-container[^"]*"/gi

/** Internal or advertising destinations that are not search results. */
function isNoise(url) {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()
    if (host === 'www.baidu.com' || host === 'baidu.com') return true
    if (host === 'cp.baidu.com' || host.includes('recommend_list')) return true
    return false
  } catch {
    return true
  }
}

export default {
  id: 'baidu',
  label: 'Baidu',
  region: 'cn',
  defaultEnabled: true,

  buildUrl(query) {
    const url = new URL(ENDPOINT)
    url.searchParams.set('wd', query)
    url.searchParams.set('ie', 'utf-8')
    url.searchParams.set('rn', '10')
    return url.href
  },

  parse(html) {
    const starts = []
    for (const match of html.matchAll(CONTAINER)) starts.push(match.index)

    const results = []
    for (let index = 0; index < starts.length; index += 1) {
      const start = starts[index]
      const end = index + 1 < starts.length ? starts[index + 1] : Math.min(html.length, start + 20000)
      const segment = html.slice(start, end)

      const openEnd = segment.indexOf('>')
      if (openEnd === -1) continue
      const mu = segment.slice(0, openEnd + 1).match(/mu="(https?:\/\/[^"]+)"/i)
      if (mu === null) continue

      const heading = segment.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)
      if (heading === null) continue

      const url = decodeEntities(mu[1])
      const title = textOf(heading[1])
      if (title === '' || isNoise(url)) continue

      const rest = segment.slice(heading.index + heading[0].length)
      const abstract = rest.match(
        /class="[^"]*(?:content-right_|c-abstract|content-line|abstract|summary)[^"]*"[^>]*>([\s\S]*?)<\/(?:span|div|p)>/i,
      )
      const snippet = abstract === null ? '' : truncate(textOf(abstract[1]), 280)
      results.push({ title, url, snippet })
    }
    return results
  },
}
