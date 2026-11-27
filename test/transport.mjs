/**
 * Transport tests: direct, CONNECT tunnel, redirects, compression, timeout.
 * Run with `node test/transport.mjs`.
 */

import http from 'node:http'
import zlib from 'node:zlib'
import assert from 'node:assert/strict'

import { fetchText, HttpError } from '../lib/http.js'
import { parseProxy, probeProxy } from '../lib/proxy.js'
import { startProxy } from './local-proxy.mjs'

const results = []
function record(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

/** A local origin with redirect, gzip, and hang routes. */
function startOrigin() {
  const server = http.createServer((req, res) => {
    if (req.url === '/redirect') {
      res.writeHead(302, { location: '/final' }).end()
      return
    }
    if (req.url === '/final') {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('redirected-ok')
      return
    }
    if (req.url === '/gzip') {
      const body = zlib.gzipSync(Buffer.from('gzip-payload-ok'))
      res.writeHead(200, { 'content-encoding': 'gzip', 'content-type': 'text/plain' }).end(body)
      return
    }
    if (req.url === '/hang') {
      return // never respond
    }
    res.writeHead(404).end('no')
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }))
  })
}

const origin = await startOrigin()
const proxy = await startProxy()
const base = `http://127.0.0.1:${origin.port}`

// 1. Direct request.
try {
  const res = await fetchText(`${base}/final`)
  record('direct request', res.status === 200 && res.text === 'redirected-ok', res.text)
} catch (error) {
  record('direct request', false, error.message)
}

// 2. Redirect following.
try {
  const res = await fetchText(`${base}/redirect`)
  record('redirect follow', res.text === 'redirected-ok', `${res.url}`)
} catch (error) {
  record('redirect follow', false, error.message)
}

// 3. gzip decoding.
try {
  const res = await fetchText(`${base}/gzip`)
  record('gzip decode', res.text === 'gzip-payload-ok', res.text)
} catch (error) {
  record('gzip decode', false, error.message)
}

// 4. Timeout.
try {
  await fetchText(`${base}/hang`, { timeoutMs: 400 })
  record('timeout', false, 'expected a timeout')
} catch (error) {
  record('timeout', error instanceof HttpError && error.code === 'ETIMEDOUT', error.code)
}

// 5. Proxy available and reachable.
const parsed = parseProxy(`127.0.0.1:${proxy.port}`)
const health = await probeProxy(parsed, { timeoutMs: 500 })
record('proxy probe up', health.ok === true, `${health.ms}ms`)

// 6. HTTP target through the proxy (absolute URI form).
try {
  const res = await fetchText(`${base}/final`, { proxy: parsed })
  record('http via proxy', res.text === 'redirected-ok', res.text)
} catch (error) {
  record('http via proxy', false, error.message)
}

// 7. TLS target through the CONNECT tunnel.
try {
  const res = await fetchText('https://www.baidu.com/', { proxy: parsed, timeoutMs: 10000 })
  record(
    'https via CONNECT',
    res.status === 200 && res.text.includes('百度'),
    `status=${res.status} bytes=${res.text.length}`,
  )
} catch (error) {
  record('https via CONNECT', false, `${error.code ?? ''} ${error.message}`)
}

// 8. Direct TLS for contrast.
try {
  const res = await fetchText('https://www.baidu.com/', { timeoutMs: 10000 })
  record('https direct', res.status === 200 && res.text.includes('百度'), `bytes=${res.text.length}`)
} catch (error) {
  record('https direct', false, `${error.code ?? ''} ${error.message}`)
}

// 9. Dead proxy address is rejected, not silently direct.
const dead = parseProxy('127.0.0.1:1')
const deadHealth = await probeProxy(dead, { timeoutMs: 400 })
record('proxy probe down', deadHealth.ok === false, deadHealth.error)

// 10. socks5 is rejected with guidance.
try {
  parseProxy('socks5://127.0.0.1:7890')
  record('socks5 rejected', false, 'expected a throw')
} catch (error) {
  record('socks5 rejected', /socks5|mixed/i.test(error.message), error.message)
}

origin.server.close()
proxy.server.close()

const failed = results.filter((item) => !item.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length > 0) {
  assert.fail(`${failed.length} transport checks failed`)
}
