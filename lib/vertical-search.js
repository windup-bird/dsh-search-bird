/**
 * Execute one coding vertical.
 *
 * Verticals are public HTTP APIs that answer from this network without a proxy,
 * so each attempt goes direct first and falls back to the proxy only when one
 * is configured and reachable. Failures carry the source name so the model can
 * tell which lookup failed instead of seeing a generic search error.
 */

import { fetchText } from './http.js'

/** One line describing a failure without leaking a stack. */
function describe(error) {
  if (error === null || error === undefined) return '未知错误'
  const code = typeof error.code === 'string' ? `${error.code}: ` : ''
  const message = typeof error.message === 'string' ? error.message : String(error)
  return `${code}${message}`.slice(0, 220)
}

/**
 * Run one vertical and return its sources.
 * @param {object} input
 * @param {object} input.vertical the vertical module.
 * @param {string} input.query the query with its prefix removed.
 * @param {object} input.settings resolved plugin settings.
 * @param {{hostname: string, port: number} | null} input.proxy parsed proxy, or null.
 * @param {boolean} input.proxyReady whether that proxy answered its probe.
 * @param {Map<string, object>} input.status per-engine status sink.
 * @param {AbortSignal} [input.signal]
 * @returns {Promise<{sources: Array<object>, total: number, vertical: string, route: string}>}
 */
export async function runVertical({ vertical, query, settings, proxy, proxyReady, status, signal }) {
  const invalid = typeof vertical.validate === 'function' ? vertical.validate(query) : null
  if (invalid !== null) throw new Error(invalid)

  const target = vertical.buildUrl(query)
  if (target === null) throw new Error(`「${vertical.label}」无法为该查询构造请求`)

  const routes = proxy !== null && proxyReady ? ['direct', 'proxy'] : ['direct']
  const started = Date.now()
  let lastError = null
  let lastRoute = routes[0]

  for (const route of routes) {
    lastRoute = route
    try {
      const response = await fetchText(target, {
        proxy: route === 'proxy' ? proxy : null,
        timeoutMs: settings.timeoutMs,
        signal,
        headers: vertical.headers ?? {},
      })

      if (response.status >= 400) {
        throw new Error(`HTTP ${response.status}`)
      }

      const sources = vertical.parse(response.text, { url: response.url })
      if (sources.length === 0) {
        throw new Error('没有匹配结果')
      }

      const limit = settings.maxResults
      status.set(vertical.id, {
        ok: true,
        route,
        ms: Date.now() - started,
        count: sources.length,
        at: Date.now(),
      })
      return {
        sources: sources.slice(0, limit),
        total: sources.length,
        vertical: vertical.id,
        route,
      }
    } catch (error) {
      lastError = error
      if (signal !== undefined && signal.aborted) break
    }
  }

  status.set(vertical.id, {
    ok: false,
    route: lastRoute,
    ms: Date.now() - started,
    count: 0,
    error: describe(lastError),
    at: Date.now(),
  })
  throw new Error(`「${vertical.label}」搜索失败：${describe(lastError)}`)
}
