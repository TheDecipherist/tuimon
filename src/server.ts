import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join, extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Socket } from 'node:net'
import type { ServerHandle } from './types.js'

// ─── Paths to bundled assets ────────────────────────────────────────────────

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const clientJsPath = join(__dirname, '..', 'client', 'tuimon-client.js')
const confirmQuitPath = join(__dirname, '..', 'templates', 'internal', 'confirm-quit.html')

// ─── MIME types ─────────────────────────────────────────────────────────────

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
}

function mimeFor(filePath: string): string {
  return MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
}

// ─── Script injection ───────────────────────────────────────────────────────

const CLIENT_SCRIPT_TAG = '<script src="/tuimon/client.js"></script>'

function injectClientScript(html: string): string {
  if (html.includes('tuimon/client.js')) return html
  return html.replace('</head>', `${CLIENT_SCRIPT_TAG}</head>`)
}

// ─── Serve helpers ──────────────────────────────────────────────────────────

function serveFile(
  res: ServerResponse,
  filePath: string,
  transform?: (content: string) => string,
): void {
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain', Connection: 'close' })
    res.end('Not Found')
    return
  }

  const mime = mimeFor(filePath)
  const raw = readFileSync(filePath)

  if (transform && mime.startsWith('text/html')) {
    const transformed = transform(raw.toString('utf-8'))
    res.writeHead(200, { 'Content-Type': mime, Connection: 'close' })
    res.end(transformed)
  } else {
    res.writeHead(200, { 'Content-Type': mime, Connection: 'close' })
    res.end(raw)
  }
}

// ─── Request handler ────────────────────────────────────────────────────────

function createHandler(rootDir: string) {
  return (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? '/'
    let pathname: string
    try {
      pathname = decodeURIComponent(url.split('?')[0] ?? '/')
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain' })
      res.end('Bad Request')
      return
    }

    // Internal tuimon routes
    if (pathname === '/tuimon/client.js') {
      serveFile(res, clientJsPath)
      return
    }

    if (pathname === '/tuimon/confirm-quit.html') {
      serveFile(res, confirmQuitPath)
      return
    }

    // Serve from rootDir
    const safePath = pathname.startsWith('/') ? pathname.slice(1) : pathname
    const filePath = resolve(rootDir, safePath)

    // Prevent path traversal — ensure resolved path is within rootDir
    const normalizedRoot = rootDir.endsWith(sep) ? rootDir : rootDir + sep
    if (!filePath.startsWith(normalizedRoot) && filePath !== rootDir) {
      res.writeHead(403, { 'Content-Type': 'text/plain' })
      res.end('Forbidden')
      return
    }

    serveFile(res, filePath, injectClientScript)
  }
}

// ─── Server startup ─────────────────────────────────────────────────────────

const START_PORT = 7337
const MAX_ATTEMPTS = 100

function tryListen(
  server: ReturnType<typeof createServer>,
  port: number,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        if (port - START_PORT >= MAX_ATTEMPTS) {
          reject(new Error(`Could not find open port after ${MAX_ATTEMPTS} attempts`))
          return
        }
        server.removeListener('error', onError)
        tryListen(server, port + 1).then(resolve, reject)
      } else {
        reject(err)
      }
    }

    server.once('error', onError)
    server.listen(port, 'localhost', () => {
      server.removeListener('error', onError)
      resolve(port)
    })
  })
}

export async function startServer({ rootDir }: { rootDir: string }): Promise<ServerHandle> {
  const server = createServer(createHandler(rootDir))

  // Track open sockets so close() can destroy them immediately
  const sockets = new Set<Socket>()
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
  })

  const port = await tryListen(server, START_PORT)
  const url = `http://localhost:${port}`

  return {
    url,
    urlFor(htmlPath: string) {
      return `${url}/${htmlPath}`
    },
    close() {
      return new Promise<void>((resolve, reject) => {
        // Destroy all open sockets so the server can close immediately
        for (const socket of sockets) {
          socket.destroy()
        }
        sockets.clear()
        server.close((err) => {
          if (err) reject(err)
          else resolve()
        })
      })
    },
  }
}
