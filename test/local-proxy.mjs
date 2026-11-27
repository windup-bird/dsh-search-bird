/**
 * A minimal local HTTP proxy used by the transport tests: it forwards absolute
 * URI requests and tunnels CONNECT targets, which is exactly the surface Clash
 * exposes on its mixed port.
 */

import http from 'node:http'
import net from 'node:net'

export function startProxy() {
  const server = http.createServer((req, res) => {
    let target
    try {
      target = new URL(req.url)
    } catch {
      res.writeHead(400).end('bad absolute URI')
      return
    }
    const upstream = http.request(
      {
        hostname: target.hostname,
        port: Number(target.port || 80),
        path: `${target.pathname}${target.search}`,
        method: req.method,
        headers: { ...req.headers, host: target.host },
      },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers)
        upstreamRes.pipe(res)
      },
    )
    upstream.on('error', () => res.writeHead(502).end('upstream failed'))
    req.pipe(upstream)
  })

  server.on('connect', (req, clientSocket, head) => {
    const [host, port] = String(req.url).split(':')
    const upstream = net.connect(Number(port), host, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head !== undefined && head.length > 0) upstream.write(head)
      upstream.pipe(clientSocket)
      clientSocket.pipe(upstream)
    })
    upstream.on('error', () => clientSocket.destroy())
    clientSocket.on('error', () => upstream.destroy())
  })

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port })
    })
  })
}
