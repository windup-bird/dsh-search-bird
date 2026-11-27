/**
 * HTTP transport with an explicit proxy choice.
 *
 * Node's global `fetch` ignores proxy environment variables, and the plugin
 * must not depend on a proxy agent package, so this module dials directly with
 * `node:http`/`node:https` and implements the CONNECT tunnel for TLS targets
 * itself. Every request is routed by the caller: the engine decides whether it
 * may go direct, through the proxy, or both.
 */

import http from 'node:http'
import https from 'node:https'
import tls from 'node:tls'
import zlib from 'node:zlib'

const MAX_BODY_BYTES = 4 * 1024 * 1024
const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308])

const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  Connection: 'close',
}

/** A transport failure with a machine-readable `code`. */
export class HttpError extends Error {
  constructor(message, { code = 'ERR_HTTP', statusCode, url } = {}) {
    super(message)
    this.name = 'HttpError'
    this.code = code
    if (statusCode !== undefined) this.statusCode = statusCode
    if (url !== undefined) this.url = url
  }
}

/** Open a CONNECT tunnel through an HTTP proxy and wrap it in TLS. */
async function openTunnel(proxy, target, timeoutMs) {
  const authority = `${target.hostname}:${target.port}`
  const socket = await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: proxy.hostname,
      port: proxy.port,
      method: 'CONNECT',
      path: authority,
      headers: { Host: authority, 'Proxy-Connection': 'keep-alive' },
    })
    let settled = false
    const fail = (error) => {
      if (settled) return
      settled = true
      req.destroy()
      reject(error)
    }
    req.setTimeout(timeoutMs, () =>
      fail(new HttpError(`代理 CONNECT 超时（${timeoutMs}ms）`, { code: 'ETIMEDOUT_PROXY' })),
    )
    req.once('connect', (res, stream) => {
      if (settled) {
        stream.destroy()
        return
      }
      if (res.statusCode !== 200) {
        stream.destroy()
        fail(
          new HttpError(`代理拒绝 CONNECT（HTTP ${res.statusCode}）`, {
            code: 'ERR_PROXY_CONNECT',
            statusCode: res.statusCode,
          }),
        )
        return
      }
      settled = true
      resolve(stream)
    })
    req.once('error', (error) => fail(error))
    req.end()
  })

  const secure = tls.connect({
    socket,
    servername: target.hostname,
    ALPNProtocols: ['http/1.1'],
  })
  try {
    await new Promise((resolve, reject) => {
      secure.once('secureConnect', resolve)
      secure.once('error', reject)
    })
  } catch (error) {
    secure.destroy()
    throw error
  }
  return secure
}

/** An agent that hands the request one already-connected socket. */
function agentFor(secure, socket) {
  const Agent = secure ? https.Agent : http.Agent
  const agent = new Agent({ keepAlive: false, maxSockets: 1 })
  agent.createConnection = (_options, callback) => {
    if (typeof callback === 'function') {
      callback(null, socket)
      return undefined
    }
    return socket
  }
  return agent
}

/** Read a whole response body under a size cap. */
function collect(res) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    res.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        res.destroy(new HttpError('响应体超过 4MB 上限', { code: 'ERR_BODY_TOO_LARGE' }))
        return
      }
      chunks.push(chunk)
    })
    res.on('end', () => resolve(Buffer.concat(chunks)))
    res.on('error', reject)
  })
}

/**
 * One request/response exchange, no redirect following.
 * @returns {Promise<{status: number, headers: object, body: Buffer}>}
 */
async function requestOnce(url, { method, headers, proxy, timeoutMs, signal }) {
  const isHttps = url.protocol === 'https:'
  const port = Number(url.port || (isHttps ? 443 : 80))
  const path = `${url.pathname}${url.search}`

  let request
  if (proxy === null) {
    const mod = isHttps ? https : http
    request = mod.request(
      { protocol: url.protocol, hostname: url.hostname, port, path, method, headers, signal },
    )
  } else if (isHttps) {
    const socket = await openTunnel(proxy, { hostname: url.hostname, port }, timeoutMs)
    request = https.request({
      protocol: 'https:',
      hostname: url.hostname,
      port,
      path,
      method,
      headers,
      agent: agentFor(true, socket),
      signal,
    })
  } else {
    request = http.request({
      hostname: proxy.hostname,
      port: proxy.port,
      path: url.href,
      method,
      headers: { ...headers, Host: url.host },
      signal,
    })
  }

  return await new Promise((resolve, reject) => {
    let settled = false
    const fail = (error) => {
      if (settled) return
      settled = true
      request.destroy()
      reject(error)
    }

    request.setTimeout(timeoutMs, () =>
      fail(new HttpError(`请求超时（${timeoutMs}ms）`, { code: 'ETIMEDOUT' })),
    )
    request.once('error', fail)
    request.once('response', (res) => {
      collect(res)
        .then((body) => {
          if (settled) return
          settled = true
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body })
        })
        .catch(fail)
    })
    request.end()
  })
}

/** Decode a response body according to its `content-encoding`. */
function decompress(body, encoding) {
  const value = String(encoding ?? '').toLowerCase()
  if (value === '') return body
  try {
    if (value.includes('br')) return zlib.brotliDecompressSync(body)
    if (value.includes('gzip')) return zlib.gunzipSync(body)
    if (value.includes('deflate')) {
      try {
        return zlib.inflateSync(body)
      } catch {
        return zlib.inflateRawSync(body)
      }
    }
  } catch {
    return body
  }
  return body
}

/**
 * Fetch a URL as text.
 * @param {string} rawUrl absolute http(s) URL.
 * @param {object} [options]
 * @param {object} [options.headers] extra request headers.
 * @param {{hostname: string, port: number} | null} [options.proxy] proxy to use, or null for direct.
 * @param {number} [options.timeoutMs] per-attempt timeout.
 * @param {AbortSignal} [options.signal] cancellation.
 * @param {number} [options.maxRedirects] redirect hops allowed.
 * @param {string} [options.method] HTTP method.
 * @returns {Promise<{status: number, headers: object, body: Buffer, text: string, url: string}>}
 */
export async function fetchText(rawUrl, options = {}) {
  const {
    headers = {},
    proxy = null,
    timeoutMs = 8000,
    signal,
    maxRedirects = 3,
    method = 'GET',
  } = options

  let url = new URL(rawUrl)
  const merged = { ...DEFAULT_HEADERS, ...headers }

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const res = await requestOnce(url, { method, headers: merged, proxy, timeoutMs, signal })

    if (REDIRECT_STATUS.has(res.status) && res.headers.location !== undefined) {
      const next = new URL(String(res.headers.location), url)
      if (next.protocol !== 'http:' && next.protocol !== 'https:') {
        throw new HttpError(`重定向到不支持的协议：${next.protocol}`, {
          code: 'ERR_REDIRECT_PROTOCOL',
          url: url.href,
        })
      }
      url = next
      continue
    }

    const body = decompress(res.body, res.headers['content-encoding'])
    return { status: res.status, headers: res.headers, body, text: body.toString('utf8'), url: url.href }
  }

  throw new HttpError('重定向次数过多', { code: 'ERR_TOO_MANY_REDIRECTS', url: url.href })
}
