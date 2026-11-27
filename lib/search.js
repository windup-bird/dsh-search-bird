/**
 * Search orchestration: pick engines, choose a route per engine, parse, resolve
 * redirects, fuse, and report.
 *
 * One engine failing degrades that engine only. The provider throws a single
 * consolidated error only when every enabled engine produced nothing, so the
 * model sees the reasons instead of a bare failure.
 */

import { fetchText } from './http.js'
import { parseProxy, probeProxy } from './proxy.js'
import { ENGINES } from './engines/index.js'
import { fuse } from './rank.js'
import { canonicalUrl } from './html.js'

const RESOLVE_TIMEOUT_MS = 2500
/** A global engine that fails this often in a row is skipped for a while. */
const FAILURE_THRESHOLD = 2
const COOLDOWN_MS = 10 * 60_000

/** Per-engine failure state; one provider runs per process. */
const cooldowns = new Map()
/** The route configuration the cooldowns were recorded under. */
let cooldownRoute = ''

/** Clear failure state (used by tests and after a configuration change). */
export function resetCooldowns() {
  cooldowns.clear()
}

/** A search that could not produce any result, carrying per-engine reasons. */
export class SearchUnavailable extends Error {
  constructor(message, { code = 'SEARCH_UNAVAILABLE', stats = [] } = {}) {
    super(message)
    this.name = 'SearchUnavailable'
    this.code = code
    this.stats = stats
  }
}

/** Resolve the configured proxy without throwing. */
export function proxyState(settings) {
  try {
    return { proxy: parseProxy(settings.proxyUrl), error: null }
  } catch (error) {
    return { proxy: null, error }
  }
}

/** Whether a response is an anti-bot page rather than a result page. */
function isBlocked(text, status) {
  if (status === 403 || status === 429) return true
  const title = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const heading = title === null ? '' : title[1]
  if (/captcha|验证码|安全验证|unusual traffic|access denied|forbidden/i.test(heading)) return true
  return /wappass\.baidu\.com\/static\/captcha|antispider|captcha-form/i.test(text.slice(0, 8000))
}

/**
 * Which transports to try, in order, for one engine.
 * @returns {Array<'direct' | 'proxy'>}
 */
export function routeFor(engine, settings, proxy, proxyReady) {
  if (settings.proxyMode === 'never') return ['direct']
  if (proxy === null) return ['direct']

  if (engine.region === 'cn') {
    // Mainland engines never detour through a proxy by design.
    if (settings.proxyMode === 'always') return ['direct']
    return proxyReady ? ['direct', 'proxy'] : ['direct']
  }

  // A configured but dead proxy means an unreachable target: skip instead of
  // burning a request timeout on a connection that cannot succeed.
  return proxyReady ? ['proxy'] : []
}

/** Follow one engine's redirect stubs (Sogou) in parallel. */
async function resolveItems(engine, items, { proxy, timeoutMs, signal }) {
  const settled = items.map(async (item) => {
    if (item.needsResolve !== true) return item
    try {
      const response = await fetchText(item.url, {
        proxy,
        timeoutMs: Math.min(timeoutMs, RESOLVE_TIMEOUT_MS),
        signal,
      })
      const target = engine.resolveFrom(response.text)
      if (target === null) return null
      const url = new URL(target)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
      return { ...item, url: url.href, needsResolve: false }
    } catch {
      return null
    }
  })
  return (await Promise.all(settled)).filter((item) => item !== null)
}

/** Run one engine across its candidate routes. */
async function runEngine(engine, context) {
  const { query, settings, proxy, proxyReady, status, signal } = context
  const routes = routeFor(engine, settings, proxy, proxyReady)
  const started = Date.now()

  const cooling = cooldowns.get(engine.id)
  if (engine.region === 'global' && cooling !== undefined && cooling.until > started) {
    const entry = {
      ok: false,
      skipped: true,
      route: null,
      ms: 0,
      count: 0,
      error: '连续失败，暂时跳过',
      at: started,
    }
    status.set(engine.id, entry)
    return { engine: engine.id, results: [], skipped: true, error: entry.error }
  }

  if (routes.length === 0) {
    const entry = {
      ok: false,
      skipped: true,
      route: null,
      ms: 0,
      count: 0,
      error: '代理不可达，已跳过',
      at: started,
    }
    status.set(engine.id, entry)
    return { engine: engine.id, results: [], skipped: true, error: entry.error }
  }

  let lastError = null
  let lastRoute = routes[0]

  for (const route of routes) {
    lastRoute = route
    try {
      const target = engine.buildUrl(query, settings)
      const response = await fetchText(target, {
        proxy: route === 'proxy' ? proxy : null,
        timeoutMs: settings.timeoutMs,
        signal,
        headers:
          engine.region === 'cn'
            ? { 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.6' }
            : { 'Accept-Language': 'en-US,en;q=0.9' },
      })

      if (isBlocked(response.text, response.status)) {
        throw new Error(`被目标站拦截（HTTP ${response.status}）`)
      }
      if (response.status >= 400) throw new Error(`HTTP ${response.status}`)

      let items = engine.parse(response.text, { url: response.url })
      if (typeof engine.resolveFrom === 'function') {
        items = await resolveItems(engine, items, {
          proxy: route === 'proxy' ? proxy : null,
          timeoutMs: settings.timeoutMs,
          signal,
        })
      }
      items = items.filter(
        (item) =>
          typeof item.title === 'string' &&
          item.title !== '' &&
          typeof item.url === 'string' &&
          canonicalUrl(item.url) !== null,
      )

      if (items.length === 0) {
        throw new Error('页面可访问但没有解析出结果（结构可能已变化）')
      }

      cooldowns.delete(engine.id)
      const entry = { ok: true, route, ms: Date.now() - started, count: items.length, at: Date.now() }
      status.set(engine.id, entry)
      return { engine: engine.id, results: items, route, ms: entry.ms }
    } catch (error) {
      lastError = error
      if (signal !== undefined && signal.aborted) break
    }
  }

  if (engine.region === 'global') {
    const previous = cooldowns.get(engine.id)
    const failures = (previous?.failures ?? 0) + 1
    cooldowns.set(engine.id, {
      failures,
      until: failures >= FAILURE_THRESHOLD ? Date.now() + COOLDOWN_MS : 0,
    })
  }

  const entry = {
    ok: false,
    route: lastRoute,
    ms: Date.now() - started,
    count: 0,
    error: describe(lastError),
    at: Date.now(),
  }
  status.set(engine.id, entry)
  return { engine: engine.id, results: [], error: entry.error }
}

/** A one-line, non-leaking description of an engine failure. */
function describe(error) {
  if (error === null || error === undefined) return '未知错误'
  const code = typeof error.code === 'string' ? `${error.code}: ` : ''
  const message = typeof error.message === 'string' ? error.message : String(error)
  return `${code}${message}`.slice(0, 200)
}

/**
 * Run one search across every enabled engine.
 * @returns {Promise<{sources: Array<object>, total: number, stats: Array<object>, engines: string[]}>}
 */
export async function runSearch({ query, maxResults, settings, status, signal, engines = ENGINES }) {
  // A changed proxy setting invalidates old failures: the user may have just
  // fixed the uplink, and a stale cooldown would keep the engine skipped.
  const route = `${settings.proxyMode}|${settings.proxyUrl}`
  if (route !== cooldownRoute) {
    cooldownRoute = route
    cooldowns.clear()
  }

  const enabled = engines.filter((engine) => settings.engines[engine.id] !== false)
  if (enabled.length === 0) {
    throw new SearchUnavailable('没有启用任何搜索引擎，请在 设置 → 插件 → 轻量搜索 中开启', {
      code: 'NO_ENGINES_ENABLED',
    })
  }

  const { proxy, error: proxyError } = proxyState(settings)
  let proxyReady = false
  if (proxy !== null && settings.proxyMode !== 'never') {
    proxyReady = (await probeProxy(proxy)).ok
  }

  const outcomes = await Promise.all(
    enabled.map((engine) => runEngine(engine, { query, settings, proxy, proxyReady, status, signal })),
  )

  const fused = fuse(outcomes, { maxResults, weights: settings.engineWeights })
  const stats = outcomes.map((outcome) => ({
    engine: outcome.engine,
    count: outcome.results.length,
    ...(outcome.skipped === true ? { skipped: true } : {}),
    ...(outcome.error === undefined ? {} : { error: outcome.error }),
  }))

  if (fused.results.length === 0) {
    const failed = stats.filter((item) => item.skipped !== true)
    const skipped = stats.filter((item) => item.skipped === true)
    const reasons =
      failed.length > 0
        ? failed.map((item) => `${item.engine}: ${item.error ?? '无结果'}`).join('；')
        : '所有引擎都被跳过了'
    const skipNote =
      skipped.length > 0
        ? `（跳过：${skipped.map((item) => `${item.engine} ${item.error}`).join('；')}）`
        : ''
    const proxyHint =
      proxyError !== null
        ? `（代理地址无效：${proxyError.message}）`
        : proxy !== null && !proxyReady && settings.proxyMode !== 'never'
          ? `（代理 ${proxy.url} 不可达）`
          : ''
    throw new SearchUnavailable(`搜索没有结果。${reasons}${skipNote}${proxyHint}`, {
      code: 'SEARCH_NO_RESULTS',
      stats,
    })
  }

  return {
    sources: fused.results,
    total: fused.total,
    stats,
    engines: enabled.map((engine) => engine.id),
  }
}
