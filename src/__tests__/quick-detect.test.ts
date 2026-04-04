import { describe, it, expect } from 'vitest'
import { detectInputType, detectLogFormat } from '../quick/detect.js'

describe('detectInputType', () => {
  it('detects URLs', () => {
    expect(detectInputType('http://localhost:3000/metrics')).toBe('url')
    expect(detectInputType('https://api.example.com/data')).toBe('url')
  })

  it('detects stdin', () => {
    expect(detectInputType('-')).toBe('stdin')
  })

  it('detects JSON files', () => {
    expect(detectInputType('data.json')).toBe('json')
    expect(detectInputType('events.jsonl')).toBe('json')
    expect(detectInputType('/var/log/app.json')).toBe('json')
  })

  it('detects CSV files', () => {
    expect(detectInputType('users.csv')).toBe('csv')
    expect(detectInputType('data.tsv')).toBe('csv')
  })

  it('detects log files', () => {
    expect(detectInputType('access.log')).toBe('log')
    expect(detectInputType('error.txt')).toBe('log')
  })

  it('detects module files', () => {
    expect(detectInputType('data.js')).toBe('module')
    expect(detectInputType('data.ts')).toBe('module')
    expect(detectInputType('data.mjs')).toBe('module')
    expect(detectInputType('data.mts')).toBe('module')
  })
})

describe('detectLogFormat', () => {
  it('detects nginx combined format', () => {
    const log = '192.168.1.1 - - [04/Apr/2026:10:00:00 +0000] "GET /api HTTP/1.1" 200 1234 "-" "curl/7.0"\n'
    expect(detectLogFormat(log)).toBe('nginx')
  })

  it('detects modsec audit log', () => {
    const log = '--abc123-A--\n[04/Apr/2026] abc123 192.168.1.1\n--abc123-Z--\n'
    expect(detectLogFormat(log)).toBe('modsec')
  })

  it('detects JSON lines', () => {
    const log = '{"level":"info","msg":"request handled","status":200}\n{"level":"error","msg":"failed"}\n'
    expect(detectLogFormat(log)).toBe('json')
  })

  it('detects plain text', () => {
    const log = 'Something happened\nAnother thing happened\nError: bad stuff\n'
    expect(detectLogFormat(log)).toBe('plain')
  })
})
