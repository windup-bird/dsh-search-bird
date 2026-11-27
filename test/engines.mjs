/**
 * Engine checks: live fetch + parse for the mainland engines, fixture parsing
 * for the proxied ones (DuckDuckGo and Google are unreachable without a proxy
 * here, so their parsers are asserted against representative markup).
 *
 * Run with `node test/engines.mjs`.
 */

import assert from 'node:assert/strict'

import { fetchText } from '../lib/http.js'
import { ENGINE_BY_ID } from '../lib/engines/index.js'
import ddg from '../lib/engines/ddg.js'
import google from '../lib/engines/google.js'

const results = []
function record(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

async function liveEngine(id, query) {
  const engine = ENGINE_BY_ID.get(id)
  const url = engine.buildUrl(query, { language: 'zh-CN' })
  const response = await fetchText(url, { timeoutMs: 12000 })
  const items = engine.parse(response.text, { url: response.url })
  const first = items[0]
  record(
    `${id} live parse`,
    items.length >= 3 && typeof first.title === 'string' && first.title.length > 0,
    `${items.length} hits, first: ${first === undefined ? 'none' : first.title.slice(0, 40)}`,
  )
  if (items.length > 0) {
    console.log(`      url: ${items[0].url}`)
    console.log(`      snippet: ${(items[0].snippet ?? '').slice(0, 70)}`)
  }
  return items
}

await liveEngine('bing', 'deepseek')
await liveEngine('baidu', 'deepseek')
await liveEngine('so360', 'deepseek')

// Sogou is opt-in because it starts answering with an anti-bot page after a
// few requests from one address; report it as informational, not a failure.
try {
  const sogou = ENGINE_BY_ID.get('sogou')
  const response = await fetchText(sogou.buildUrl('deepseek'), { timeoutMs: 12000 })
  const items = sogou.parse(response.text, { url: response.url })
  if (items.length === 0) {
    console.log('INFO  sogou 当前被反爬拦截（保持默认关闭）')
  } else {
    console.log(`INFO  sogou 可用，${items.length} 条`)
    const pending = items.find((item) => item.needsResolve === true)
    if (pending !== undefined) {
      const stub = await fetchText(pending.url, { timeoutMs: 8000 })
      const target = sogou.resolveFrom(stub.text)
      record(
        'sogou redirect resolve',
        typeof target === 'string' && /^https?:/.test(target),
        String(target),
      )
    }
  }
} catch (error) {
  console.log(`INFO  sogou 不可用：${error.message}`)
}

// DuckDuckGo Lite fixture.
const ddgFixture = `
<table>
  <tr><td class="result-link"><a rel="nofollow" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fa%3Fx%3D1&amp;rut=abc" class="result-link">Example A</a></td></tr>
  <tr><td class="result-snippet">First snippet about example.</td></tr>
  <tr><td class="result-link"><a rel="nofollow" href="https://example.org/b" class="result-link">Example B</a></td></tr>
  <tr><td class="result-snippet">Second snippet.</td></tr>
</table>`
try {
  const items = ddg.parse(ddgFixture, { url: 'https://lite.duckduckgo.com/lite/?q=x' })
  assert.equal(items.length, 2)
  assert.equal(items[0].url, 'https://example.com/a?x=1')
  assert.equal(items[0].snippet, 'First snippet about example.')
  assert.equal(items[1].url, 'https://example.org/b')
  record('ddg fixture parse', true, `${items.length} hits`)
} catch (error) {
  record('ddg fixture parse', false, error.message)
}

// Google fixture (anchor wrapping a heading, both href forms).
const googleFixture = `
<div class="g">
  <a href="/url?q=https%3A%2F%2Fexample.com%2Fpage&amp;sa=U"><h3>Example Page</h3></a>
  <div><span>The page description follows here.</span></div>
</div>
<div class="g">
  <a href="https://example.net/direct"><h3>Direct Page</h3></a>
  <div><span>Another description.</span></div>
</div>
<a href="/search?q=more"><h3>More results</h3></a>`
try {
  const items = google.parse(googleFixture, { url: 'https://www.google.com/search?q=x' })
  assert.equal(items.length, 2)
  assert.equal(items[0].url, 'https://example.com/page')
  assert.equal(items[1].url, 'https://example.net/direct')
  assert.ok(items[0].snippet.includes('description'))
  record('google fixture parse', true, `${items.length} hits`)
} catch (error) {
  record('google fixture parse', false, error.message)
}

const failed = results.filter((item) => !item.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length > 0) assert.fail(`${failed.length} engine checks failed`)
