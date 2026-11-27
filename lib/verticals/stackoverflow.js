/**
 * Stack Overflow search, coding vertical.
 *
 * The public API works without a key but has a small daily quota shared by the
 * whole IP, so a quota answer is reported as such instead of looking like an
 * outage.
 */

import { textOf, truncate } from '../html.js'

export default {
  id: 'stackoverflow',
  prefix: 'so',
  label: 'Stack Overflow',
  description: 'Questions and answers by error text or topic',

  buildUrl(query) {
    const url = new URL('https://api.stackexchange.com/2.3/search/advanced')
    url.searchParams.set('order', 'desc')
    url.searchParams.set('sort', 'relevance')
    url.searchParams.set('q', query)
    url.searchParams.set('site', 'stackoverflow')
    url.searchParams.set('pagesize', '8')
    return url.href
  },

  parse(text) {
    const data = JSON.parse(text)
    if (data.error_id !== undefined) {
      throw new Error(`Stack Exchange API：${String(data.error_message ?? data.error_name ?? '').slice(0, 120)}`)
    }
    const items = Array.isArray(data.items) ? data.items : []
    return items.map((item) => {
      const tags = Array.isArray(item.tags) ? item.tags.slice(0, 3).join(',') : ''
      const score = Number(item.score) || 0
      const answered = item.is_answered === true ? ' · 已采纳' : ''
      const title = textOf(String(item.title ?? ''))
      return {
        title,
        url: String(item.link ?? ''),
        snippet: truncate(`[${tags}] · 分数 ${score}${answered}`, 260),
        publishedAt: item.creation_date === undefined
          ? undefined
          : new Date(Number(item.creation_date) * 1000).toISOString(),
      }
    }).filter((item) => item.title !== '' && item.url !== '')
  },
}
