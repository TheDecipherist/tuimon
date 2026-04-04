import { readFileSync } from 'node:fs'
import type { InputType } from './types.js'

export function detectInputType(input: string): InputType {
  // URL
  if (input.startsWith('http://') || input.startsWith('https://')) return 'url'

  // stdin
  if (input === '-') return 'stdin'

  // By file extension
  const ext = input.split('.').pop()?.toLowerCase() ?? ''

  switch (ext) {
    case 'json':
    case 'jsonl':
      return 'json'
    case 'csv':
    case 'tsv':
      return 'csv'
    case 'js':
    case 'ts':
    case 'mjs':
    case 'mts':
      return 'module'
    case 'log':
    case 'txt':
      return 'log'
    default:
      // Try content-based detection
      return detectByContent(input)
  }
}

function detectByContent(filePath: string): InputType {
  try {
    const head = readFileSync(filePath, 'utf-8').slice(0, 4096)

    // ModSecurity audit log
    if (/--[a-f0-9]+-A--/i.test(head)) return 'log'

    // JSON
    const trimmed = head.trimStart()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json'

    // CSV (has commas/tabs in most lines)
    const lines = head.split('\n').filter((l) => l.trim())
    if (lines.length >= 2) {
      const commas = lines.slice(0, 5).filter((l) => l.includes(',')).length
      if (commas >= 3) return 'csv'
    }

    // Default to log
    return 'log'
  } catch {
    return 'log'
  }
}

export function detectLogFormat(content: string): 'nginx' | 'modsec' | 'json' | 'plain' {
  const head = content.slice(0, 4096)

  // ModSecurity audit log sections
  if (/--[a-f0-9]+-A--/i.test(head)) return 'modsec'

  // Nginx combined log format
  const nginxPattern = /^\S+ \S+ \S+ \[[^\]]+\] "\S+ \S+ [^"]*" \d+ \d+/
  const lines = head.split('\n').filter((l) => l.trim())
  if (lines.length > 0 && nginxPattern.test(lines[0] ?? '')) return 'nginx'

  // JSON lines
  const firstLine = (lines[0] ?? '').trim()
  if (firstLine.startsWith('{') && firstLine.endsWith('}')) {
    try {
      JSON.parse(firstLine)
      return 'json'
    } catch { /* not json */ }
  }

  return 'plain'
}
