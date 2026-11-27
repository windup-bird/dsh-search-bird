/**
 * Small HTML/URL helpers shared by the engine parsers.
 *
 * The parsers are deliberately regex-based: the plugin ships no dependencies
 * and no DOM, and every engine's result list is a flat, repeating structure.
 * A parser that finds nothing returns an empty array so the caller can report
 * one degraded engine instead of failing the whole search.
 */

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ensp: ' ',
  emsp: ' ',
  middot: '·',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  laquo: '«',
  raquo: '»',
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
  times: '×',
}

/** Decode the entity forms that appear in search result markup. */
export function decodeEntities(text) {
  if (typeof text !== 'string' || text === '') return ''
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body) => {
    if (body[0] === '#') {
      const hex = body[1] === 'x' || body[1] === 'X'
      const code = Number.parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10)
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match
      try {
        return String.fromCodePoint(code)
      } catch {
        return match
      }
    }
    const named = NAMED_ENTITIES[body.toLowerCase()]
    return named === undefined ? match : named
  })
}

/** Unwrap CDATA sections, which RSS feeds use instead of escaping. */
export function unwrapCdata(text) {
  return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_match, inner) => inner)
}

/** Drop markup and decode entities. */
export function stripTags(html) {
  if (typeof html !== 'string' || html === '') return ''
  const withoutReplaced = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
  return decodeEntities(withoutReplaced.replace(/<[^>]*>/g, ' '))
}

/** Markup-free single-line text. */
export function textOf(html) {
  return stripTags(html).replace(/\s+/g, ' ').trim()
}

/** Cap a string, adding an ellipsis when it was cut. */
export function truncate(text, max) {
  const value = typeof text === 'string' ? text.trim() : ''
  if (value.length <= max) return value
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

/** Resolve a possibly relative href against a page URL. */
export function absolutize(href, base) {
  const value = decodeEntities(String(href ?? '')).trim()
  if (value === '' || value.startsWith('#') || /^javascript:/i.test(value)) return null
  try {
    const url = new URL(value, base)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'spm',
  'scm',
  'from',
  'from_source',
  'source',
  'ref',
  'ref_src',
  'share_token',
  'gclid',
  'fbclid',
  'msclkid',
  'yclid',
  'vd_source',
  'spm_id_from',
  'scene',
  'srcid',
  'fr',
  'fm',
  'src',
])

/**
 * A dedupe key for one result URL: host without `www.`, path without a
 * trailing slash, no tracking parameters, no fragment.
 * @returns {string | null} null when the URL is not fetchable.
 */
export function canonicalUrl(raw) {
  let url
  try {
    url = new URL(String(raw))
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  const host = url.hostname.replace(/^www\./i, '').toLowerCase()
  const path = url.pathname.replace(/\/+$/, '') || '/'
  const params = [...url.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAMS.has(key.toLowerCase()))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  const query = params.length === 0 ? '' : `?${params.map(([k, v]) => `${k}=${v}`).join('&')}`
  return `${host}${path}${query}`
}
