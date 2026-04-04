#!/usr/bin/env npx tsx

// Generates a realistic nginx access.log with 1000 entries
import { writeFileSync } from 'node:fs'

const methods = ['GET', 'GET', 'GET', 'GET', 'POST', 'POST', 'PUT', 'DELETE']
const paths = [
  '/api/users', '/api/users/123', '/api/posts', '/api/posts/456',
  '/api/auth/login', '/api/auth/logout', '/api/comments',
  '/health', '/metrics', '/api/orders', '/api/products',
  '/static/app.js', '/static/style.css', '/images/logo.png',
  '/admin', '/admin/users', '/api/search?q=test',
]
const statuses = [200, 200, 200, 200, 200, 201, 204, 301, 304, 400, 401, 403, 404, 404, 500, 502]
const agents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/17.0',
  'curl/7.88.0',
  'PostmanRuntime/7.36.0',
  'python-requests/2.31.0',
  'Googlebot/2.1',
]

const lines: string[] = []
const baseTime = new Date('2026-04-04T10:00:00Z')

for (let i = 0; i < 1000; i++) {
  const time = new Date(baseTime.getTime() + i * 3600) // ~1 per 3.6 seconds
  const ip = `${10 + Math.floor(Math.random() * 240)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`
  const method = methods[Math.floor(Math.random() * methods.length)]!
  const path = paths[Math.floor(Math.random() * paths.length)]!
  const status = statuses[Math.floor(Math.random() * statuses.length)]!
  const bytes = Math.floor(Math.random() * 50000)
  const agent = agents[Math.floor(Math.random() * agents.length)]!
  const ts = time.toISOString().replace('T', ':').replace(/\.\d+Z/, ' +0000')

  lines.push(`${ip} - - [${ts}] "${method} ${path} HTTP/1.1" ${status} ${bytes} "-" "${agent}"`)
}

const outPath = '/tmp/access.log'
writeFileSync(outPath, lines.join('\n') + '\n')
console.log(`Generated ${lines.length} log entries at ${outPath}`)
