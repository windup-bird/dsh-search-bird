/**
 * GitHub repository search, coding vertical.
 *
 * The public search API needs no key but allows only 10 requests a minute
 * anonymously, so a rate-limit answer is translated into a message the model
 * can act on instead of a bare HTTP 403.
 */

import { truncate } from '../html.js'

export default {
  id: 'github',
  prefix: 'gh',
  label: 'GitHub',
  description: 'Repositories by name, topic, or description',

  buildUrl(query) {
    const url = new URL('https://api.github.com/search/repositories')
    url.searchParams.set('q', query)
    url.searchParams.set('sort', 'stars')
    url.searchParams.set('order', 'desc')
    url.searchParams.set('per_page', '8')
    return url.href
  },

  headers: {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  },

  parse(text) {
    const data = JSON.parse(text)
    if (data.message !== undefined && Array.isArray(data.items) === false) {
      throw new Error(
        /rate limit/i.test(String(data.message))
          ? 'GitHub 匿名接口限流（10 次/分钟），稍后再试'
          : `GitHub API：${String(data.message).slice(0, 120)}`,
      )
    }
    const items = Array.isArray(data.items) ? data.items : []
    return items.map((item) => {
      const language = typeof item.language === 'string' ? item.language : ''
      const stars = Number(item.stargazers_count) || 0
      const description = typeof item.description === 'string' ? item.description : ''
      const facts = [language, `★${stars.toLocaleString('en-US')}`].filter((part) => part !== '')
      return {
        title: String(item.full_name),
        url: String(item.html_url),
        snippet: truncate([...facts, description].filter((part) => part !== '').join(' · '), 260),
        publishedAt: typeof item.updated_at === 'string' ? item.updated_at : undefined,
      }
    })
  },
}
