/**
 * arXiv search, coding vertical for papers.
 *
 * The export endpoint answers Atom XML; titles and abstracts keep the feed's
 * line breaks, so both are collapsed before they reach the model.
 */

import { textOf, truncate, unwrapCdata } from '../html.js'

export default {
  id: 'arxiv',
  prefix: 'paper',
  label: 'arXiv',
  description: 'Preprints by title, abstract, or author',
  // arXiv rate-limits an address that queries faster than once every 3 s, so
  // this source is opt-in rather than default-on.
  defaultEnabled: false,

  buildUrl(query) {
    const url = new URL('https://export.arxiv.org/api/query')
    url.searchParams.set('search_query', `all:${query}`)
    url.searchParams.set('start', '0')
    url.searchParams.set('max_results', '8')
    url.searchParams.set('sortBy', 'relevance')
    return url.href
  },

  parse(text) {
    const results = []
    for (const match of text.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)) {
      const entry = unwrapCdata(match[1])
      const field = (tag) => {
        const found = entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'))
        return found === null ? '' : textOf(found[1])
      }
      const title = field('title')
      const id = field('id')
      if (title === '' || id === '') continue
      const authors = [...entry.matchAll(/<name>([\s\S]*?)<\/name>/gi)]
        .slice(0, 3)
        .map((author) => textOf(author[1]))
        .filter((name) => name !== '')
      const summary = field('summary')
      const facts = authors.length > 0 ? [authors.join(', ')] : []
      results.push({
        title,
        url: id,
        snippet: truncate([...facts, summary].filter((part) => part !== '').join(' · '), 260),
        publishedAt: field('published') === '' ? undefined : field('published'),
      })
    }
    return results
  },
}
