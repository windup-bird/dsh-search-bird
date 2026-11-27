/**
 * Proxy parsing and liveness probing.
 *
 * The plugin talks to Clash's HTTP/mixed port (CONNECT for TLS targets), which
 * is what Clash exposes by default. SOCKS is rejected loudly instead of
 * silently falling back to a direct connection.
 */

import net from 'node:net'

const PROBE_TTL_MS = 20_000

/** Cached probe results, keyed by `host:port`. */
const cache = new Map()

/**
 * Parse a proxy setting into a dialable target.
 * @param {string} raw configured value, e.g. `127.0.0.1:7897` or `http://host:port`.
 * @returns {{hostname: string, port: number, url: string} | null} null when unset.
 */
export function parseProxy(raw) {
  const text = typeof raw === 'string' ? raw.trim() : ''
  if (text === '') return null

  let url
  try {
    url = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? new URL(text) : new URL(`http://${text}`)
  } catch {
    throw new Error(`代理地址无法解析：${text}`)
  }

  if (url.protocol === 'socks5:' || url.protocol === 'socks5h:') {
    throw new Error('暂不支持 socks5 代理，请改用 Clash 的 HTTP/mixed 端口（如 127.0.0.1:7897）')
  }
  if (url.protocol !== 'http:') {
    throw new Error(`不支持的代理协议：${url.protocol.replace(':', '')}`)
  }

  const port = Number(url.port || 80)
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`代理端口无效：${url.port}`)
  }
  return { hostname: url.hostname, port, url: `http://${url.hostname}:${port}` }
}

/**
 * One TCP connect attempt, bounded by `timeoutMs`.
 * @returns {Promise<{ok: boolean, ms: number, error?: string}>}
 */
function probeOnce(proxy, timeoutMs) {
  const started = Date.now()
  return new Promise((resolve) => {
    const socket = net.connect({ host: proxy.hostname, port: proxy.port })
    let settled = false
    const finish = (ok, error) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve({ ok, ms: Date.now() - started, ...(error ? { error } : {}) })
    }
    socket.setTimeout(timeoutMs, () => finish(false, 'timeout'))
    socket.once('connect', () => finish(true))
    socket.once('error', (err) => finish(false, err.code ?? err.message))
  })
}

/**
 * Probe proxy reachability, memoized briefly so a stopped proxy never costs a
 * full request timeout on every search.
 * @param {{hostname: string, port: number}} proxy
 * @returns {Promise<{ok: boolean, ms: number, at: number, error?: string}>}
 */
export async function probeProxy(proxy, { timeoutMs = 800, ttlMs = PROBE_TTL_MS } = {}) {
  const key = `${proxy.hostname}:${proxy.port}`
  const hit = cache.get(key)
  if (hit !== undefined && Date.now() - hit.at < ttlMs) return hit

  const result = { ...(await probeOnce(proxy, timeoutMs)), at: Date.now() }
  cache.set(key, result)
  return result
}

/** Forget cached probe results (used after a configuration change). */
export function resetProxyHealth() {
  cache.clear()
}
