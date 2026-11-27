/**
 * End-to-end pipeline check with no Harness: routing, fusion, and the
 * "Clash is not running" degradation path.
 *
 * Run with `node test/search.mjs`.
 */

import assert from 'node:assert/strict'

import { runSearch, routeFor, proxyState, resetCooldowns, SearchUnavailable } from '../lib/search.js'
import { ENGINES, ENGINE_BY_ID } from '../lib/engines/index.js'

const results = []
function record(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

function settings(overrides = {}) {
  return {
    engines: { bing: true, baidu: true, so360: true, sogou: false, ddg: true, google: false },
    proxyUrl: 'http://127.0.0.1:7897',
    proxyMode: 'auto',
    maxResults: 8,
    timeoutMs: 8000,
    cacheTtlMs: 300000,
    language: 'zh-CN',
    engineWeights: {},
    ...overrides,
  }
}

// Routing table: mainland engines never detour, global engines prefer the proxy.
{
  const cn = ENGINE_BY_ID.get('bing')
  const global = ENGINE_BY_ID.get('ddg')
  const proxy = { hostname: '127.0.0.1', port: 7897 }
  assert.deepEqual(routeFor(cn, settings(), proxy, true), ['direct', 'proxy'])
  assert.deepEqual(routeFor(cn, settings({ proxyMode: 'always' }), proxy, true), ['direct'])
  assert.deepEqual(routeFor(global, settings(), proxy, true), ['proxy'])
  // A configured but dead proxy means the target is unreachable: skip it.
  assert.deepEqual(routeFor(global, settings(), proxy, false), [])
  assert.deepEqual(routeFor(global, settings({ proxyMode: 'never' }), proxy, true), ['direct'])
  assert.deepEqual(routeFor(global, settings(), null, false), ['direct'])
  assert.deepEqual(routeFor(cn, settings(), null, false), ['direct'])
  record('route policy', true)
}

// No engines enabled is a precise, actionable failure.
try {
  await runSearch({
    query: 'x',
    maxResults: 5,
    settings: settings({
      engines: { bing: false, baidu: false, so360: false, sogou: false, ddg: false, google: false },
    }),
    status: new Map(),
  })
  record('no engines enabled', false, 'expected a throw')
} catch (error) {
  record(
    'no engines enabled',
    error.code === 'NO_ENGINES_ENABLED' && /设置/.test(error.message),
    error.message,
  )
}

// Live search with the proxy unreachable: mainland engines must still answer,
// and the proxied engine must be skipped rather than stalling the call.
{
  const started = Date.now()
  const status = new Map()
  const outcome = await runSearch({
    query: 'deepseek 最新进展',
    maxResults: 8,
    settings: settings({ proxyUrl: 'http://127.0.0.1:1' }),
    status,
  })
  const elapsed = Date.now() - started
  record(
    'search with proxy down',
    outcome.sources.length >= 3,
    `${outcome.sources.length} sources, ${outcome.total} merged, ${elapsed}ms`,
  )
  record(
    'dead proxy does not stall',
    elapsed < 6000,
    `${elapsed}ms (ddg skipped, CN unaffected)`,
  )
  record('skipped engine is reported', outcome.stats.some((item) => item.skipped === true))

  console.log('\n  merged sources:')
  for (const [index, source] of outcome.sources.entries()) {
    console.log(`  ${index + 1}. [${source.engines.join('+')}] ${source.title.slice(0, 52)}`)
    console.log(`     ${source.url.slice(0, 100)}`)
  }
  console.log('\n  per-engine stats:')
  for (const [id, stat] of status) {
    console.log(`  ${id}: ${JSON.stringify(stat)}`)
  }

  const engines = new Set(outcome.sources.flatMap((source) => source.engines))
  record('multiple engines contribute', engines.size >= 2, [...engines].join(', '))
  record(
    'every source has a usable URL',
    outcome.sources.every((source) => /^https?:\/\//.test(source.url)),
  )
  record(
    'deduplicated',
    new Set(outcome.sources.map((source) => source.url)).size === outcome.sources.length,
  )
}

// A global engine that keeps failing is skipped for a while.
{
  resetCooldowns()
  const fake = {
    id: 'fake',
    label: 'Fake',
    region: 'global',
    defaultEnabled: true,
    buildUrl: () => 'http://127.0.0.1:1/x',
    parse: () => [],
  }
  const settingsWithFake = { ...settings({ proxyUrl: '', proxyMode: 'never' }), engines: { fake: true } }
  const status = new Map()

  const attempt = async () => {
    try {
      return await runSearch({ query: 'x', maxResults: 5, settings: settingsWithFake, status, engines: [fake] })
    } catch (error) {
      return error
    }
  }

  const first = await attempt()
  const second = await attempt()
  const third = await attempt()
  record(
    'two failures trigger a cooldown',
    first instanceof SearchUnavailable && second instanceof SearchUnavailable,
  )
  record(
    'cooling engine is skipped without a request',
    third instanceof SearchUnavailable && /跳过/.test(third.message),
    third instanceof Error ? third.message.slice(0, 60) : '',
  )
  record('cooldown state is visible', status.get('fake')?.skipped === true)

  resetCooldowns()
  const afterReset = await attempt()
  record(
    'reset clears the cooldown',
    status.get('fake')?.skipped !== true && afterReset instanceof SearchUnavailable,
  )
}

// Invalid proxy text degrades with a message instead of throwing.
{
  const { error } = proxyState(settings({ proxyUrl: 'socks5://127.0.0.1:7890' }))
  record('invalid proxy surfaced', error instanceof Error && /socks5|mixed/i.test(error.message), error.message)
}

const failed = results.filter((item) => !item.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length > 0) assert.fail(`${failed.length} pipeline checks failed`)
