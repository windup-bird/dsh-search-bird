/**
 * The Host half: register a web-search provider with the harness seam.
 *
 * No new tool is registered on purpose. `web_search` already exists and routes
 * through `ctx.web`, so this plugin owns selection and transport only.
 */

import z from '@deepseek-ai/schemastery'

import { ENGINE_BY_ID, ENGINE_IDS, ENGINES } from './lib/engines/index.js'
import { VERTICALS, parseVerticalQuery, detectVertical } from './lib/verticals/index.js'
import { SearchCache } from './lib/cache.js'
import { parseProxy, probeProxy } from './lib/proxy.js'
import { proxyState, runSearch } from './lib/search.js'
import { runVertical } from './lib/vertical-search.js'

/** Provider id selected by the bundle patch (`web.searchProvider`). */
export const PROVIDER_ID = 'search-bird'

export const inject = ['web']

const STATUS_PATH = '/api/search-bird/status'

export const Config = z.object({
  engines: z
    .object({
      bing: z.boolean().default(true),
      baidu: z.boolean().default(true),
      so360: z.boolean().default(true),
      sogou: z.boolean().default(false),
      ddg: z.boolean().default(true),
      google: z.boolean().default(false),
    })
    .default({})
    .volatile(),
  verticals: z
    .object({
      github: z.boolean().default(true),
      crates: z.boolean().default(true),
      npm: z.boolean().default(true),
      pypi: z.boolean().default(true),
      stackoverflow: z.boolean().default(true),
      arxiv: z.boolean().default(false),
    })
    .default({})
    .volatile(),
  proxyUrl: z.string().default('http://127.0.0.1:7897').volatile(),
  proxyMode: z.string().default('auto').volatile(),
  maxResults: z.number().default(8).volatile(),
  timeoutMs: z.number().default(8000).volatile(),
  cacheTtlMs: z.number().default(300_000).volatile(),
  language: z.string().default('zh-CN').volatile(),
})

/** Read a field that may be a live (volatile) schema node or a plain value. */
function readSetting(node, fallback) {
  if (node !== null && typeof node === 'object' && typeof node.get === 'function') {
    const value = node.get()
    return value === undefined ? fallback : value
  }
  return node === undefined || node === null ? fallback : node
}

/** Clamp a numeric setting into a usable range. */
function clamp(value, min, max, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, Math.round(number)))
}

/** Project the live config into the plain object the search pipeline consumes. */
export function resolveSettings(config) {
  const rawEngines = readSetting(config.engines, {})
  const engines = {}
  for (const id of ENGINE_IDS) {
    const configured = rawEngines !== null && typeof rawEngines === 'object' ? rawEngines[id] : undefined
    engines[id] = typeof configured === 'boolean' ? configured : ENGINE_BY_ID.get(id).defaultEnabled
  }

  const rawVerticals = readSetting(config.verticals, {})
  const verticals = {}
  for (const vertical of VERTICALS) {
    const configured = rawVerticals !== null && typeof rawVerticals === 'object' ? rawVerticals[vertical.id] : undefined
    verticals[vertical.id] =
      typeof configured === 'boolean' ? configured : vertical.defaultEnabled !== false
  }

  const mode = readSetting(config.proxyMode, 'auto')
  return {
    engines,
    verticals,
    proxyUrl: String(readSetting(config.proxyUrl, '') ?? ''),
    proxyMode: mode === 'always' || mode === 'never' ? mode : 'auto',
    maxResults: clamp(readSetting(config.maxResults, 8), 1, 20, 8),
    timeoutMs: clamp(readSetting(config.timeoutMs, 8000), 1000, 30_000, 8000),
    cacheTtlMs: clamp(readSetting(config.cacheTtlMs, 300_000), 0, 3_600_000, 300_000),
    language: String(readSetting(config.language, 'zh-CN') ?? ''),
    engineWeights: {},
  }
}

/**
 * Register the read-only status resource the settings card polls.
 * @returns {() => void} route disposer.
 */
function registerStatusRoute(webServer, { getSettings, getSelectedProvider, status, startedAt }) {
  return webServer.register({
    kind: 'exact',
    path: STATUS_PATH,
    resource: async () => {
      const settings = getSettings()
      let proxy = { url: null, mode: settings.proxyMode, error: null, health: null }

      try {
        const parsed = parseProxy(settings.proxyUrl)
        if (parsed !== null) {
          proxy.url = parsed.url
          if (settings.proxyMode !== 'never') {
            const health = await probeProxy(parsed)
            proxy.health = { ok: health.ok, ms: health.ms, error: health.error ?? null, at: health.at }
          }
        }
      } catch (error) {
        proxy.error = error instanceof Error ? error.message : String(error)
      }

      const body = {
        provider: PROVIDER_ID,
        selectedProvider: getSelectedProvider(),
        startedAt,
        now: Date.now(),
        proxy,
        engines: ENGINES.map((engine) => ({
          id: engine.id,
          label: engine.label,
          region: engine.region,
          enabled: settings.engines[engine.id] !== false,
          last: status.get(engine.id) ?? null,
        })),
        verticals: VERTICALS.map((vertical) => ({
          id: vertical.id,
          prefix: vertical.prefix,
          label: vertical.label,
          enabled: settings.verticals[vertical.id] !== false,
          last: status.get(vertical.id) ?? null,
        })),
        limits: { maxResults: settings.maxResults, timeoutMs: settings.timeoutMs },
      }

      return new Response(JSON.stringify(body), {
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      })
    },
  })
}

/** Mount the provider and its status route. */
export function apply(ctx, config) {
  const startedAt = Date.now()
  const status = new Map()
  let cache = new SearchCache({ ttlMs: resolveSettings(config).cacheTtlMs })
  let cacheTtl = resolveSettings(config).cacheTtlMs

  const getSettings = () => resolveSettings(config)

  // Read-only view of the seam's configured provider, for the settings card.
  const settingsService = ctx.get('settings')
  const getSelectedProvider = () => {
    if (settingsService === undefined) return null
    try {
      const descriptor = settingsService.describe().find((item) => item.ns === 'web')
      const configured = descriptor?.value?.searchProvider
      return typeof configured === 'string' ? configured : null
    } catch {
      return null
    }
  }

  const provider = {
    id: PROVIDER_ID,
    // Selection must succeed even when every engine is down so the model sees
    // the real per-engine reasons instead of a provider-selection error.
    available() {
      return true
    },
    async search(request, signal) {
      const settings = getSettings()
      const raw = String(request?.query ?? '').trim()
      if (raw === '') throw new Error('搜索词为空')

      const limit = clamp(request?.maxResults ?? settings.maxResults, 1, 20, settings.maxResults)
      const cacheOf = () => {
        if (cacheTtl !== settings.cacheTtlMs) {
          cache = new SearchCache({ ttlMs: settings.cacheTtlMs })
          cacheTtl = settings.cacheTtlMs
        }
        return cache
      }

      // A source prefix (or an unambiguous repository reference) selects one
      // vertical and never runs the web engines.
      const routed = parseVerticalQuery(raw) ?? detectVertical(raw)
      if (routed !== null) {
        const { vertical, query } = routed
        if (settings.verticals[vertical.id] === false) {
          throw new Error(
            `「${vertical.label}」源未启用：设置 → 插件 → 轻量搜索 → 编程源；去掉 ${vertical.prefix}: 前缀可走普通网页搜索`,
          )
        }

        const store = cacheOf()
        const key = JSON.stringify(['vertical', vertical.id, query, limit])
        const hit = store.get(key)
        if (hit !== undefined) return hit

        const { proxy } = proxyState(settings)
        let proxyReady = false
        if (proxy !== null && settings.proxyMode !== 'never') {
          proxyReady = (await probeProxy(proxy)).ok
        }

        const outcome = await runVertical({
          vertical,
          query,
          settings: { ...settings, maxResults: limit },
          proxy,
          proxyReady,
          status,
          signal,
        })
        const value = {
          sources: outcome.sources,
          truncated: outcome.total > outcome.sources.length,
        }
        store.set(key, value)
        return value
      }

      const query = raw
      if (cacheTtl !== settings.cacheTtlMs) {
        cache = new SearchCache({ ttlMs: settings.cacheTtlMs })
        cacheTtl = settings.cacheTtlMs
      }

      const enabled = ENGINE_IDS.filter((id) => settings.engines[id] !== false)
      const cacheKey = JSON.stringify([query, limit, settings.language, settings.proxyMode, enabled])
      const cached = cache.get(cacheKey)
      if (cached !== undefined) return cached

      const outcome = await runSearch({ query, maxResults: limit, settings, status, signal })
      const value = {
        sources: outcome.sources,
        truncated: outcome.total > outcome.sources.length,
      }
      cache.set(cacheKey, value)
      return value
    },
  }

  ctx.effect(() => ctx.web.registerSearchProvider(provider), 'search-bird: search provider')

  const systemPrompt = ctx.get('systemPrompt')
  if (systemPrompt !== undefined) {
    let order = 210
    try {
      order = systemPrompt.getContextOrder('WEB_SURFACE')
    } catch {
      // An older composition may not name that placement; keep the fallback.
    }
    ctx.effect(
      () =>
        systemPrompt.section({
          name: 'tool:web-search-sources',
          order,
          text:
            'web_search understands source prefixes for developer lookups: gh: GitHub repositories, ' +
            'crate: crates.io, npm: npm, pypi: an exact PyPI package name, so: Stack Overflow, ' +
            'paper: arXiv. Use a prefix when the question is about a repository, package, error ' +
            'thread, or paper; a plain query searches the open web.',
        }),
      'search-bird: source-prefix prompt',
    )
  }

  const webServer = ctx.get('webServer')
  if (webServer !== undefined) {
    ctx.effect(
      () => registerStatusRoute(webServer, { getSettings, getSelectedProvider, status, startedAt }),
      'search-bird: status route',
    )
  }
}
