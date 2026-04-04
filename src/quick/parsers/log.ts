import { readFileSync } from 'node:fs'
import type { LogData, LogEntry } from '../types.js'
import { detectLogFormat } from '../detect.js'

const MAX_LINES = 10000
const MAX_BYTES = 10 * 1024 * 1024 // 10MB

const NGINX_RE =
  /^(\S+) \S+ \S+ \[([^\]]+)\] "(\S+) (\S+) [^"]*" (\d+) (\d+) "([^"]*)" "([^"]*)"/

export function parseLogFile(filePath: string): LogData {
  let content = readFileSync(filePath, 'utf-8')

  // Memory safety: if file is too large, keep only the tail
  if (content.length > MAX_BYTES) {
    const allLines = content.split('\n')
    content = allLines.slice(-MAX_LINES).join('\n')
  }

  const format = detectLogFormat(content)

  // Delegate modsec elsewhere — this parser handles nginx/json/plain
  if (format === 'modsec') {
    // Treat as plain if somehow routed here
    return parsePlain(content)
  }

  switch (format) {
    case 'nginx':
      return parseNginx(content)
    case 'json':
      return parseJson(content)
    default:
      return parsePlain(content)
  }
}

// ─── Nginx combined log ──────────────────────────────────────────────────────

function parseNginx(content: string): LogData {
  const rawLines = content.split('\n').filter((l) => l.trim())
  const lines = rawLines.slice(-MAX_LINES)

  const entries: LogEntry[] = []
  const statusCodes: Record<string, number> = {}
  const methods: Record<string, number> = {}
  const endpoints: Record<string, number> = {}
  const ips: Record<string, number> = {}
  let errorCount = 0
  let skipped = 0
  let firstTimestamp: string | undefined
  let lastTimestamp: string | undefined

  for (const line of lines) {
    const m = NGINX_RE.exec(line)
    if (!m) {
      skipped++
      continue
    }

    const ip = m[1]!
    const timestamp = m[2]!
    const method = m[3]!
    const path = m[4]!
    const status = parseInt(m[5]!, 10)
    const bytes = parseInt(m[6]!, 10)
    const referer = m[7]!
    const userAgent = m[8]!

    entries.push({
      raw: line,
      timestamp,
      ip,
      method,
      path,
      status,
      bytes,
      referer,
      userAgent,
    })

    // Stats
    const statusKey = String(status)
    statusCodes[statusKey] = (statusCodes[statusKey] ?? 0) + 1

    methods[method] = (methods[method] ?? 0) + 1
    endpoints[path] = (endpoints[path] ?? 0) + 1
    ips[ip] = (ips[ip] ?? 0) + 1

    if (status >= 400) errorCount++

    if (!firstTimestamp) firstTimestamp = timestamp
    lastTimestamp = timestamp
  }

  const stats: LogData['stats'] = {
    totalLines: entries.length + skipped,
    statusCodes,
    methods,
    topEndpoints: topN(endpoints, 20),
    topIPs: topN(ips, 20),
    errorCount,
  }
  if (firstTimestamp && lastTimestamp) {
    stats.timeRange = { start: firstTimestamp, end: lastTimestamp }
  }

  return {
    type: 'log',
    format: 'nginx',
    entries,
    stats,
  }
}

// ─── JSON lines ──────────────────────────────────────────────────────────────

function parseJson(content: string): LogData {
  const rawLines = content.split('\n').filter((l) => l.trim())
  const lines = rawLines.slice(-MAX_LINES)

  const entries: LogEntry[] = []
  let errorCount = 0
  let skipped = 0
  let firstTimestamp: string | undefined
  let lastTimestamp: string | undefined

  for (const line of lines) {
    let obj: Record<string, unknown>
    try {
      obj = JSON.parse(line)
    } catch {
      skipped++
      continue
    }

    const level = stringField(obj, 'level')
    const message = stringField(obj, 'msg') ?? stringField(obj, 'message')
    const timestamp =
      stringField(obj, 'timestamp') ?? stringField(obj, 'time') ?? stringField(obj, 'ts')
    const status = numberField(obj, 'status')

    const entry: LogEntry = { raw: line }
    if (level !== undefined) entry.level = level
    if (message !== undefined) entry.message = message
    if (timestamp !== undefined) entry.timestamp = timestamp
    if (status !== undefined) entry.status = status
    entries.push(entry)

    if (level?.toLowerCase() === 'error') errorCount++

    if (timestamp) {
      if (!firstTimestamp) firstTimestamp = timestamp
      lastTimestamp = timestamp
    }
  }

  const stats: LogData['stats'] = {
    totalLines: entries.length + skipped,
    errorCount,
  }
  if (firstTimestamp && lastTimestamp) {
    stats.timeRange = { start: firstTimestamp, end: lastTimestamp }
  }

  return {
    type: 'log',
    format: 'json',
    entries,
    stats,
  }
}

// ─── Plain text ──────────────────────────────────────────────────────────────

function parsePlain(content: string): LogData {
  const rawLines = content.split('\n').filter((l) => l.trim())
  const lines = rawLines.slice(-MAX_LINES)

  const entries: LogEntry[] = lines.map((line) => ({ raw: line }))

  return {
    type: 'log',
    format: 'plain',
    entries,
    stats: {
      totalLines: lines.length,
    },
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function topN(map: Record<string, number>, n: number): Record<string, number> {
  const sorted = Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
  return Object.fromEntries(sorted)
}

function stringField(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key]
  return typeof v === 'string' ? v : v !== undefined && v !== null ? String(v) : undefined
}

function numberField(obj: Record<string, unknown>, key: string): number | undefined {
  const v = obj[key]
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const n = parseInt(v, 10)
    return isNaN(n) ? undefined : n
  }
  return undefined
}
