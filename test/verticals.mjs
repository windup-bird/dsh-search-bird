/**
 * Coding-vertical checks: prefix routing, repository detection, and one live
 * lookup per source (all of them answer directly from this network).
 *
 * Run with `node test/verticals.mjs`.
 */

import assert from 'node:assert/strict'

import { VERTICALS, VERTICAL_BY_ID, parseVerticalQuery, detectVertical } from '../lib/verticals/index.js'
import { runVertical } from '../lib/vertical-search.js'

const results = []
function record(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

// ---- Routing ---------------------------------------------------------------

{
  const gh = parseVerticalQuery('gh: tokio-rs/tokio')
  assert.equal(gh?.vertical.id, 'github')
  assert.equal(gh?.query, 'tokio-rs/tokio')

  const crate = parseVerticalQuery('crate:  serde json')
  assert.equal(crate?.vertical.id, 'crates')
  assert.equal(crate?.query, 'serde json')

  assert.equal(parseVerticalQuery('foo: bar'), null, 'unknown prefix stays a web query')
  assert.equal(parseVerticalQuery('gh:'), null, 'a prefix without a query is not routing')
  assert.equal(parseVerticalQuery('how to sort in rust'), null)
  record('prefix routing', true)
}

{
  assert.equal(detectVertical('tokio-rs/tokio')?.vertical.id, 'github')
  assert.equal(detectVertical('tokio-rs/tokio')?.query, 'repo:tokio-rs/tokio')

  const url = detectVertical('look at https://github.com/gin-gonic/gin for routing')
  assert.equal(url?.query, 'repo:gin-gonic/gin')

  const gitUrl = detectVertical('https://github.com/tokio-rs/tokio.git')
  assert.equal(gitUrl?.query, 'repo:tokio-rs/tokio')

  assert.equal(detectVertical('TCP/IP stack'), null, 'a ratio is not a repository')
  assert.equal(detectVertical('async/await'), null, 'a slash phrase is not a repository')
  assert.equal(detectVertical('and/or'), null, 'a slash phrase is not a repository')
  assert.equal(detectVertical('a/b'), null, 'single-letter halves are not repositories')
  assert.equal(detectVertical('vercel/next.js')?.query, 'repo:vercel/next.js')
  assert.equal(detectVertical('2024/01 release notes'), null, 'a date is not a repository')
  assert.equal(detectVertical('how to sort in rust'), null)
  record('repository detection', true)
}

// ---- Constraint checks -----------------------------------------------------

{
  const pypi = VERTICAL_BY_ID.get('pypi')
  assert.equal(pypi.validate('requests'), null)
  assert.match(String(pypi.validate('how to use requests')), /精确包名/)
  assert.equal(pypi.buildUrl('how to use requests'), null)
  record('pypi accepts only exact names', true)
}

// ---- Live lookups ----------------------------------------------------------

const settings = { maxResults: 6, timeoutMs: 12000 }
const proxy = null
const proxyReady = false

async function live(id, query) {
  const vertical = VERTICAL_BY_ID.get(id)
  const status = new Map()
  try {
    const outcome = await runVertical({ vertical, query, settings, proxy, proxyReady, status })
    const first = outcome.sources[0]
    record(
      `${id} live`,
      outcome.sources.length >= 1 && /^https?:\/\//.test(first.url) && first.title !== '',
      `${outcome.sources.length} hits · ${first.title.slice(0, 44)}`,
    )
    console.log(`      ${first.url}`)
    console.log(`      ${(first.snippet ?? '').slice(0, 90)}`)
  } catch (error) {
    if (id === 'arxiv' && /429|ETIMEDOUT|超时/.test(error.message)) {
      console.log(`INFO  ${id} 暂时限流：${error.message.slice(0, 60)}`)
      return
    }
    record(`${id} live`, false, error.message)
  }
}

await live('github', 'repo:tokio-rs/tokio')
await live('crates', 'serde json')
await live('npm', 'zod validation')
await live('pypi', 'requests')
await live('stackoverflow', 'rust borrow checker')
// arXiv rate-limits per address; report a 429/timeout as informational.
try {
  await live('arxiv', 'transformer attention')
} catch (error) {
  console.log(`INFO  arxiv 暂时限流：${error.message}`)
}

// Every vertical declares the fields the card and router rely on.
{
  const ok = VERTICALS.every(
    (vertical) =>
      typeof vertical.id === 'string' &&
      typeof vertical.prefix === 'string' &&
      typeof vertical.label === 'string' &&
      typeof vertical.buildUrl === 'function' &&
      typeof vertical.parse === 'function',
  )
  record('vertical contract', ok, VERTICALS.map((vertical) => vertical.prefix).join(', '))
}

const failed = results.filter((item) => !item.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length > 0) assert.fail(`${failed.length} vertical checks failed`)
