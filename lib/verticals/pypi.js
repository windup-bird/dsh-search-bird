/**
 * PyPI package lookup, coding vertical.
 *
 * PyPI's own search page is a JavaScript application and its XML-RPC search is
 * gone, so this vertical is an exact package lookup: the first token of the
 * query is the distribution name. That is the deterministic question it can
 * answer ("what version of requests is current"), and it says so when the name
 * does not exist rather than silently returning nothing.
 */

import { truncate } from '../html.js'

/** The distribution name a query names, or null when it names none. */
function packageName(query) {
  const token = String(query).trim()
  if (token === '' || token.length > 128) return null
  // A distribution name has no spaces; a phrase is not a package name.
  if (/\s/.test(token)) return null
  if (/[^\w.\-]/.test(token)) return null
  return token
}

export default {
  id: 'pypi',
  prefix: 'pypi',
  label: 'PyPI',
  description: 'Exact Python package name (version, summary, links)',

  buildUrl(query) {
    const name = packageName(query)
    if (name === null) return null
    return `https://pypi.org/pypi/${encodeURIComponent(name)}/json`
  },

  /** Reject queries this vertical cannot answer before spending a request. */
  validate(query) {
    return packageName(query) === null
      ? 'PyPI 只支持精确包名（例如 pypi: requests），不支持关键词搜索'
      : null
  },

  parse(text) {
    const data = JSON.parse(text)
    const info = data.info ?? {}
    if (typeof info.name !== 'string' || info.name === '') return []
    const facts = [`v${info.version}`]
    if (typeof info.requires_python === 'string' && info.requires_python !== '') {
      facts.push(`python ${info.requires_python}`)
    }
    const summary = typeof info.summary === 'string' ? info.summary : ''
    return [
      {
        title: `${info.name} ${info.version ?? ''}`.trim(),
        url: `https://pypi.org/project/${info.name}/`,
        snippet: truncate([...facts, summary].filter((part) => part !== '').join(' · '), 260),
      },
    ]
  },
}
