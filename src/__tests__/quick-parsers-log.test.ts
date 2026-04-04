import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { parseLogFile } from '../quick/parsers/log.js'
import { parseModSecFile } from '../quick/parsers/modsec.js'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

let tmpDir: string
beforeEach(() => {
  tmpDir = join(tmpdir(), `tuimon-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(tmpDir, { recursive: true })
})
afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

// ─── Log Parser Tests ───────────────────────────────────────────────────────

describe('parseLogFile', () => {
  const nginxLine = (
    ip: string,
    method: string,
    path: string,
    status: number,
    bytes: number,
  ) =>
    `${ip} - - [10/Oct/2023:13:55:36 +0000] "${method} ${path} HTTP/1.1" ${status} ${bytes} "-" "Mozilla/5.0"`

  it('parses nginx combined format lines', () => {
    const file = join(tmpDir, 'access.log')
    writeFileSync(
      file,
      [
        nginxLine('1.2.3.4', 'GET', '/index.html', 200, 1024),
        nginxLine('5.6.7.8', 'POST', '/api/data', 201, 512),
      ].join('\n'),
    )

    const result = parseLogFile(file)
    expect(result.type).toBe('log')
    expect(result.format).toBe('nginx')
    expect(result.entries).toHaveLength(2)
    expect(result.entries[0]!.ip).toBe('1.2.3.4')
    expect(result.entries[0]!.method).toBe('GET')
    expect(result.entries[0]!.path).toBe('/index.html')
    expect(result.entries[0]!.status).toBe(200)
    expect(result.entries[0]!.bytes).toBe(1024)
  })

  it('extracts status code distribution', () => {
    const file = join(tmpDir, 'access.log')
    writeFileSync(
      file,
      [
        nginxLine('1.1.1.1', 'GET', '/', 200, 100),
        nginxLine('1.1.1.1', 'GET', '/a', 200, 100),
        nginxLine('1.1.1.1', 'GET', '/b', 404, 50),
        nginxLine('1.1.1.1', 'GET', '/c', 500, 0),
      ].join('\n'),
    )

    const result = parseLogFile(file)
    expect(result.stats.statusCodes).toEqual({ '200': 2, '404': 1, '500': 1 })
  })

  it('extracts method distribution', () => {
    const file = join(tmpDir, 'access.log')
    writeFileSync(
      file,
      [
        nginxLine('1.1.1.1', 'GET', '/', 200, 100),
        nginxLine('1.1.1.1', 'POST', '/api', 201, 50),
        nginxLine('1.1.1.1', 'GET', '/page', 200, 200),
        nginxLine('1.1.1.1', 'DELETE', '/item', 204, 0),
      ].join('\n'),
    )

    const result = parseLogFile(file)
    expect(result.stats.methods).toEqual({ GET: 2, POST: 1, DELETE: 1 })
  })

  it('extracts top endpoints', () => {
    const file = join(tmpDir, 'access.log')
    const lines: string[] = []
    for (let i = 0; i < 5; i++) lines.push(nginxLine('1.1.1.1', 'GET', '/hot', 200, 100))
    for (let i = 0; i < 3; i++) lines.push(nginxLine('1.1.1.1', 'GET', '/warm', 200, 100))
    lines.push(nginxLine('1.1.1.1', 'GET', '/cold', 200, 100))
    writeFileSync(file, lines.join('\n'))

    const result = parseLogFile(file)
    const ep = result.stats.topEndpoints!
    expect(ep['/hot']).toBe(5)
    expect(ep['/warm']).toBe(3)
    expect(ep['/cold']).toBe(1)
  })

  it('extracts top IPs', () => {
    const file = join(tmpDir, 'access.log')
    const lines: string[] = []
    for (let i = 0; i < 4; i++) lines.push(nginxLine('10.0.0.1', 'GET', '/', 200, 100))
    for (let i = 0; i < 2; i++) lines.push(nginxLine('10.0.0.2', 'GET', '/', 200, 100))
    writeFileSync(file, lines.join('\n'))

    const result = parseLogFile(file)
    expect(result.stats.topIPs!['10.0.0.1']).toBe(4)
    expect(result.stats.topIPs!['10.0.0.2']).toBe(2)
  })

  it('counts errors (4xx + 5xx)', () => {
    const file = join(tmpDir, 'access.log')
    writeFileSync(
      file,
      [
        nginxLine('1.1.1.1', 'GET', '/', 200, 100),
        nginxLine('1.1.1.1', 'GET', '/a', 301, 0),
        nginxLine('1.1.1.1', 'GET', '/b', 403, 0),
        nginxLine('1.1.1.1', 'GET', '/c', 404, 0),
        nginxLine('1.1.1.1', 'GET', '/d', 500, 0),
        nginxLine('1.1.1.1', 'GET', '/e', 502, 0),
      ].join('\n'),
    )

    const result = parseLogFile(file)
    // 403 + 404 + 500 + 502 = 4 errors
    expect(result.stats.errorCount).toBe(4)
  })

  it('handles JSON log lines', () => {
    const file = join(tmpDir, 'app.log')
    writeFileSync(
      file,
      [
        JSON.stringify({ level: 'info', msg: 'started', timestamp: '2023-10-10T00:00:00Z' }),
        JSON.stringify({ level: 'error', msg: 'fail', timestamp: '2023-10-10T00:01:00Z' }),
        JSON.stringify({ level: 'info', msg: 'ok', timestamp: '2023-10-10T00:02:00Z' }),
      ].join('\n'),
    )

    const result = parseLogFile(file)
    expect(result.format).toBe('json')
    expect(result.entries).toHaveLength(3)
    expect(result.entries[0]!.level).toBe('info')
    expect(result.entries[0]!.message).toBe('started')
    expect(result.stats.errorCount).toBe(1)
    expect(result.stats.timeRange).toEqual({
      start: '2023-10-10T00:00:00Z',
      end: '2023-10-10T00:02:00Z',
    })
  })

  it('handles plain text lines', () => {
    const file = join(tmpDir, 'plain.log')
    writeFileSync(file, 'line one\nline two\nline three\n')

    const result = parseLogFile(file)
    expect(result.format).toBe('plain')
    expect(result.entries).toHaveLength(3)
    expect(result.entries[0]!.raw).toBe('line one')
    expect(result.stats.totalLines).toBe(3)
  })

  it('skips unparseable nginx lines', () => {
    const file = join(tmpDir, 'access.log')
    writeFileSync(
      file,
      [
        nginxLine('1.1.1.1', 'GET', '/', 200, 100),
        'this is not a valid nginx log line',
        'another bad line',
        nginxLine('2.2.2.2', 'POST', '/api', 201, 50),
      ].join('\n'),
    )

    const result = parseLogFile(file)
    expect(result.format).toBe('nginx')
    expect(result.entries).toHaveLength(2)
    // totalLines includes skipped
    expect(result.stats.totalLines).toBe(4)
  })
})

// ─── ModSec Parser Tests ────────────────────────────────────────────────────

describe('parseModSecFile', () => {
  function buildAuditLog(events: {
    id: string
    timestamp: string
    clientIp: string
    clientPort: number
    serverIp: string
    serverPort: number
    method: string
    uri: string
    httpCode: number
    messages?: { ruleId: string; msg: string; severity: string; tags?: string[] }[]
    action?: string
  }[]) {
    const parts: string[] = []
    for (const evt of events) {
      parts.push(`--${evt.id}-A--`)
      parts.push(
        `[${evt.timestamp}] ${evt.id} ${evt.clientIp} ${evt.clientPort} ${evt.serverIp} ${evt.serverPort}`,
      )
      parts.push(`--${evt.id}-B--`)
      parts.push(`${evt.method} ${evt.uri} HTTP/1.1`)
      parts.push('Host: example.com')
      parts.push(`--${evt.id}-F--`)
      parts.push(`HTTP/1.1 ${evt.httpCode} OK`)
      parts.push(`--${evt.id}-H--`)
      if (evt.messages && evt.messages.length > 0) {
        for (const m of evt.messages) {
          let line = `Message: [id "${m.ruleId}"] [msg "${m.msg}"] [severity "${m.severity}"]`
          if (m.tags) {
            for (const t of m.tags) {
              line += ` [tag "${t}"]`
            }
          }
          parts.push(line)
        }
      }
      if (evt.action) {
        parts.push(`Action: ${evt.action}`)
      }
      parts.push(`--${evt.id}-Z--`)
    }
    return parts.join('\n')
  }

  const sampleEvent = {
    id: 'abc123',
    timestamp: '10/Oct/2023:13:55:36 +0000',
    clientIp: '192.168.1.100',
    clientPort: 45678,
    serverIp: '10.0.0.1',
    serverPort: 443,
    method: 'GET',
    uri: '/admin',
    httpCode: 403,
    messages: [
      {
        ruleId: '942100',
        msg: 'SQL Injection Attack Detected',
        severity: 'CRITICAL',
        tags: ['OWASP_CRS', 'attack-sqli'],
      },
    ],
    action: 'Intercepted',
  }

  it('parses serial audit log with A/B/F/H/Z sections', () => {
    const file = join(tmpDir, 'modsec.log')
    writeFileSync(file, buildAuditLog([sampleEvent]))

    const result = parseModSecFile(file)
    expect(result.type).toBe('modsec')
    expect(result.events).toHaveLength(1)
    expect(result.stats.totalEvents).toBe(1)
  })

  it('extracts client IP and timestamp from section A', () => {
    const file = join(tmpDir, 'modsec.log')
    writeFileSync(file, buildAuditLog([sampleEvent]))

    const result = parseModSecFile(file)
    const evt = result.events[0]!
    expect(evt.clientIp).toBe('192.168.1.100')
    expect(evt.timestamp).toBe('10/Oct/2023:13:55:36 +0000')
  })

  it('extracts method and URI from section B', () => {
    const file = join(tmpDir, 'modsec.log')
    writeFileSync(file, buildAuditLog([sampleEvent]))

    const result = parseModSecFile(file)
    const evt = result.events[0]!
    expect(evt.method).toBe('GET')
    expect(evt.uri).toBe('/admin')
  })

  it('extracts HTTP code from section F', () => {
    const file = join(tmpDir, 'modsec.log')
    writeFileSync(file, buildAuditLog([sampleEvent]))

    const result = parseModSecFile(file)
    expect(result.events[0]!.httpCode).toBe(403)
  })

  it('extracts rule messages from section H (id, msg, severity)', () => {
    const file = join(tmpDir, 'modsec.log')
    writeFileSync(file, buildAuditLog([sampleEvent]))

    const result = parseModSecFile(file)
    const msgs = result.events[0]!.messages
    expect(msgs).toHaveLength(1)
    expect(msgs[0]!.id).toBe('942100')
    expect(msgs[0]!.msg).toBe('SQL Injection Attack Detected')
    expect(msgs[0]!.severity).toBe('CRITICAL')
    expect(msgs[0]!.tags).toEqual(['OWASP_CRS', 'attack-sqli'])
  })

  it('detects attack category from rule ID', () => {
    const file = join(tmpDir, 'modsec.log')
    const events = [
      { ...sampleEvent, id: 'evt1', messages: [{ ruleId: '942100', msg: 'SQLi', severity: 'CRITICAL' }] },
      { ...sampleEvent, id: 'evt2', messages: [{ ruleId: '941100', msg: 'XSS', severity: 'CRITICAL' }] },
      { ...sampleEvent, id: 'evt3', messages: [{ ruleId: '932100', msg: 'RCE', severity: 'CRITICAL' }] },
    ]
    writeFileSync(file, buildAuditLog(events))

    const result = parseModSecFile(file)
    expect(result.stats.attackCategories['SQLi (SQL Injection)']).toBe(1)
    expect(result.stats.attackCategories['XSS (Cross-Site Scripting)']).toBe(1)
    expect(result.stats.attackCategories['RCE (Remote Code Execution)']).toBe(1)
  })

  it('calculates severity distribution', () => {
    const file = join(tmpDir, 'modsec.log')
    const events = [
      {
        ...sampleEvent,
        id: 'evt1',
        messages: [
          { ruleId: '942100', msg: 'a', severity: 'CRITICAL' },
          { ruleId: '942101', msg: 'b', severity: 'WARNING' },
        ],
      },
      {
        ...sampleEvent,
        id: 'evt2',
        messages: [{ ruleId: '941100', msg: 'c', severity: 'CRITICAL' }],
      },
    ]
    writeFileSync(file, buildAuditLog(events))

    const result = parseModSecFile(file)
    expect(result.stats.severityCounts['CRITICAL']).toBe(2)
    expect(result.stats.severityCounts['WARNING']).toBe(1)
  })

  it('calculates top rules', () => {
    const file = join(tmpDir, 'modsec.log')
    const events = [
      { ...sampleEvent, id: 'evt1', messages: [{ ruleId: '942100', msg: 'a', severity: 'CRITICAL' }] },
      { ...sampleEvent, id: 'evt2', messages: [{ ruleId: '942100', msg: 'b', severity: 'CRITICAL' }] },
      { ...sampleEvent, id: 'evt3', messages: [{ ruleId: '941100', msg: 'c', severity: 'WARNING' }] },
    ]
    writeFileSync(file, buildAuditLog(events))

    const result = parseModSecFile(file)
    expect(result.stats.topRules['942100']).toBe(2)
    expect(result.stats.topRules['941100']).toBe(1)
  })

  it('counts blocked vs passed requests', () => {
    const file = join(tmpDir, 'modsec.log')
    const events = [
      { ...sampleEvent, id: 'evt1', httpCode: 403, action: 'Intercepted' },
      { ...sampleEvent, id: 'evt2', httpCode: 200, action: undefined },
      { ...sampleEvent, id: 'evt3', httpCode: 500, action: undefined },
    ]
    writeFileSync(file, buildAuditLog(events))

    const result = parseModSecFile(file)
    // evt1: Intercepted, evt3: httpCode >= 400
    expect(result.stats.blockedRequests).toBe(2)
  })

  it('handles events with no messages in section H', () => {
    const file = join(tmpDir, 'modsec.log')
    const evt = { ...sampleEvent, id: 'nomsg1', messages: undefined as unknown as typeof sampleEvent.messages }
    // Build manually without messages
    const content = [
      `--nomsg1-A--`,
      `[10/Oct/2023:13:55:36 +0000] nomsg1 192.168.1.100 45678 10.0.0.1 443`,
      `--nomsg1-B--`,
      `GET /page HTTP/1.1`,
      `--nomsg1-F--`,
      `HTTP/1.1 200 OK`,
      `--nomsg1-H--`,
      `--nomsg1-Z--`,
    ].join('\n')
    writeFileSync(file, content)

    const result = parseModSecFile(file)
    expect(result.events).toHaveLength(1)
    expect(result.events[0]!.messages).toHaveLength(0)
    expect(result.events[0]!.method).toBe('GET')
    expect(result.events[0]!.uri).toBe('/page')
    expect(result.events[0]!.httpCode).toBe(200)
  })
})
