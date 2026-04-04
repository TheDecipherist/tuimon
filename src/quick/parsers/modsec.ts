import { readFileSync } from 'node:fs'
import type { ModSecData, ModSecEvent, ModSecMessage } from '../types.js'

const MAX_EVENTS = 10000

const SECTION_RE = /^--([a-zA-Z0-9@._-]+)-([A-Z])--$/

const RULE_ID_RE = /\[id "(\d+)"\]/g
const RULE_MSG_RE = /\[msg "([^"]+)"\]/g
const RULE_SEV_RE = /\[severity "([^"]+)"\]/g
const RULE_TAG_RE = /\[tag "([^"]+)"\]/g
const ACTION_RE = /Action: (\S+)/

const ATTACK_CATEGORIES: Record<string, string> = {
  '920': 'Protocol Violation',
  '921': 'Protocol Attack',
  '930': 'LFI (Local File Inclusion)',
  '931': 'RFI (Remote File Inclusion)',
  '932': 'RCE (Remote Code Execution)',
  '933': 'PHP Injection',
  '934': 'Node.js Injection',
  '941': 'XSS (Cross-Site Scripting)',
  '942': 'SQLi (SQL Injection)',
  '943': 'Session Fixation',
  '944': 'Java Attack',
  '913': 'Scanner Detection',
}

export function parseModSecFile(filePath: string): ModSecData {
  const content = readFileSync(filePath, 'utf-8')

  // Try JSON lines format first
  const trimmed = content.trimStart()
  if (trimmed.startsWith('{')) {
    return parseJsonModSec(content)
  }

  return parseSerialAuditLog(content)
}

// ─── Serial audit log format ────────────────────────────────────────────────

function parseSerialAuditLog(content: string): ModSecData {
  const lines = content.split('\n')
  const events: ModSecEvent[] = []

  // Collect sections per unique ID
  type Sections = Partial<Record<string, string[]>>
  const eventSections = new Map<string, Sections>()
  const eventOrder: string[] = []

  let currentId: string | null = null
  let currentSection: string | null = null
  let currentLines: string[] = []

  for (const line of lines) {
    const m = SECTION_RE.exec(line)
    if (m) {
      // Flush previous section
      if (currentId && currentSection) {
        let sections = eventSections.get(currentId)
        if (!sections) {
          sections = {}
          eventSections.set(currentId, sections)
          eventOrder.push(currentId)
        }
        sections[currentSection] = currentLines
      }

      currentId = m[1]!
      currentSection = m[2]!
      currentLines = []

      // Init entry if new
      if (!eventSections.has(currentId)) {
        eventSections.set(currentId, {})
        eventOrder.push(currentId)
      }

      continue
    }

    currentLines.push(line)
  }

  // Flush last section
  if (currentId && currentSection) {
    let sections = eventSections.get(currentId)
    if (!sections) {
      sections = {}
      eventSections.set(currentId, sections)
      eventOrder.push(currentId)
    }
    sections[currentSection] = currentLines
  }

  // Deduplicate eventOrder
  const seen = new Set<string>()
  const uniqueOrder = eventOrder.filter((id) => {
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })

  // Parse each event (cap at MAX_EVENTS)
  for (const id of uniqueOrder.slice(0, MAX_EVENTS)) {
    const sections = eventSections.get(id)
    if (!sections) continue

    const event = parseSections(id, sections)
    if (event) events.push(event)
  }

  return buildModSecData(events)
}

function parseSections(
  uniqueId: string,
  sections: Partial<Record<string, string[]>>,
): ModSecEvent | null {
  // Section A: header
  const aLines = sections['A'] ?? []
  const aLine = aLines.find((l) => l.trim().length > 0)
  let timestamp = ''
  let clientIp = ''
  let clientPort: number | undefined
  let serverIp: string | undefined
  let serverPort: number | undefined

  if (aLine) {
    // Format: [dd/Mon/yyyy:HH:mm:ss +ZZZZ] uniqueId sourceIp sourcePort destIp destPort
    const aMatch = aLine.match(
      /\[([^\]]+)\]\s+\S+\s+(\S+)\s+(\d+)\s+(\S+)\s+(\d+)/,
    )
    if (aMatch) {
      timestamp = aMatch[1]!
      clientIp = aMatch[2]!
      clientPort = parseInt(aMatch[3]!, 10)
      serverIp = aMatch[4]!
      serverPort = parseInt(aMatch[5]!, 10)
    } else {
      // v3 format or other variant — try simpler extraction
      const simpleParts = aLine.trim().split(/\s+/)
      // Look for timestamp in brackets
      const tsMatch = aLine.match(/\[([^\]]+)\]/)
      if (tsMatch) timestamp = tsMatch[1]!
      // Look for IP-like strings
      for (const part of simpleParts) {
        if (/^\d+\.\d+\.\d+\.\d+$/.test(part) && !clientIp) {
          clientIp = part
        }
      }
    }
  }

  // Section B: request line + headers
  const bLines = sections['B'] ?? []
  let method = ''
  let uri = ''
  let protocol: string | undefined

  const requestLine = bLines.find((l) => l.trim().length > 0)
  if (requestLine) {
    const parts = requestLine.trim().split(/\s+/)
    method = parts[0] ?? ''
    uri = parts[1] ?? ''
    protocol = parts[2]
  }

  // Section F: response status
  const fLines = sections['F'] ?? []
  let httpCode = 0

  const statusLine = fLines.find((l) => l.trim().length > 0)
  if (statusLine) {
    const fMatch = statusLine.match(/\S+\s+(\d+)/)
    if (fMatch) {
      httpCode = parseInt(fMatch[1]!, 10)
    }
  }

  // Section H: messages/trailer
  const hLines = sections['H'] ?? []
  const hContent = hLines.join('\n')
  const messages = parseHSection(hContent)

  let action: string | undefined
  const actionMatch = ACTION_RE.exec(hContent)
  if (actionMatch) {
    action = actionMatch[1]!
  }

  // Build raw from all sections
  const rawParts: string[] = []
  for (const [key, val] of Object.entries(sections)) {
    rawParts.push(`--${uniqueId}-${key}--`)
    rawParts.push(...(val ?? []))
  }
  const raw = rawParts.join('\n')

  const event: ModSecEvent = {
    uniqueId,
    timestamp,
    clientIp,
    method,
    uri,
    httpCode,
    messages,
    raw,
  }
  if (clientPort !== undefined) event.clientPort = clientPort
  if (serverIp !== undefined) event.serverIp = serverIp
  if (serverPort !== undefined) event.serverPort = serverPort
  if (protocol !== undefined) event.protocol = protocol
  if (action !== undefined) event.action = action

  return event
}

function parseHSection(content: string): ModSecMessage[] {
  // Find all rule IDs first, then match msgs/severities/tags at same positions
  const ids: { id: string; index: number }[] = []
  let m: RegExpExecArray | null

  const idRe = new RegExp(RULE_ID_RE.source, 'g')
  while ((m = idRe.exec(content)) !== null) {
    ids.push({ id: m[1]!, index: m.index })
  }

  if (ids.length === 0) return []

  const messages: ModSecMessage[] = []

  for (let i = 0; i < ids.length; i++) {
    const start = ids[i]!.index
    const end = i + 1 < ids.length ? ids[i + 1]!.index : content.length
    const segment = content.slice(start, end)

    const msgMatch = /\[msg "([^"]+)"\]/.exec(segment)
    const sevMatch = /\[severity "([^"]+)"\]/.exec(segment)

    const tags: string[] = []
    const tagRe = new RegExp(RULE_TAG_RE.source, 'g')
    let tagMatch: RegExpExecArray | null
    while ((tagMatch = tagRe.exec(segment)) !== null) {
      tags.push(tagMatch[1]!)
    }

    const message: ModSecMessage = {
      id: ids[i]!.id,
      msg: msgMatch?.[1] ?? '',
      severity: sevMatch?.[1] ?? '',
    }
    if (tags.length > 0) message.tags = tags
    messages.push(message)
  }

  return messages
}

// ─── JSON lines modsec format ───────────────────────────────────────────────

function parseJsonModSec(content: string): ModSecData {
  const lines = content.split('\n').filter((l) => l.trim())
  const events: ModSecEvent[] = []

  for (const line of lines.slice(0, MAX_EVENTS)) {
    let obj: Record<string, unknown>
    try {
      obj = JSON.parse(line)
    } catch {
      continue
    }

    const tx = obj['transaction'] as Record<string, unknown> | undefined
    if (!tx) continue

    const request = tx['request'] as Record<string, unknown> | undefined
    const response = tx['response'] as Record<string, unknown> | undefined
    const rawMessages = tx['messages'] as Record<string, unknown>[] | undefined

    const messages: ModSecMessage[] = (rawMessages ?? []).map((m) => {
      const msg: ModSecMessage = {
        id: String(m['id'] ?? ''),
        msg: String(m['msg'] ?? m['message'] ?? ''),
        severity: String(m['severity'] ?? ''),
      }
      if (Array.isArray(m['tags'])) msg.tags = m['tags'].map(String)
      return msg
    })

    const event: ModSecEvent = {
      uniqueId: String(tx['unique_id'] ?? tx['id'] ?? ''),
      timestamp: String(tx['timestamp'] ?? tx['time_stamp'] ?? ''),
      clientIp: String(tx['client_ip'] ?? ''),
      method: String(request?.['method'] ?? ''),
      uri: String(request?.['uri'] ?? ''),
      httpCode: typeof response?.['http_code'] === 'number' ? response['http_code'] : 0,
      messages,
      raw: line,
    }
    if (typeof tx['client_port'] === 'number') event.clientPort = tx['client_port']
    if (typeof tx['server_ip'] === 'string') event.serverIp = tx['server_ip']
    if (typeof tx['server_port'] === 'number') event.serverPort = tx['server_port']
    if (typeof request?.['protocol'] === 'string') event.protocol = request['protocol']
    if (typeof tx['action'] === 'string') event.action = tx['action']

    events.push(event)
  }

  return buildModSecData(events)
}

// ─── Stats builder ──────────────────────────────────────────────────────────

function buildModSecData(events: ModSecEvent[]): ModSecData {
  const severityCounts: Record<string, number> = {}
  const ruleCounts: Record<string, number> = {}
  const ipCounts: Record<string, number> = {}
  const attackCats: Record<string, number> = {}
  let blockedRequests = 0
  let firstTimestamp: string | undefined
  let lastTimestamp: string | undefined

  for (const evt of events) {
    // IP counts
    if (evt.clientIp) {
      ipCounts[evt.clientIp] = (ipCounts[evt.clientIp] ?? 0) + 1
    }

    // Blocked?
    if (evt.action === 'Intercepted' || evt.httpCode >= 400) {
      blockedRequests++
    }

    // Timestamps
    if (evt.timestamp) {
      if (!firstTimestamp) firstTimestamp = evt.timestamp
      lastTimestamp = evt.timestamp
    }

    // Messages
    for (const msg of evt.messages) {
      if (msg.severity) {
        severityCounts[msg.severity] = (severityCounts[msg.severity] ?? 0) + 1
      }

      if (msg.id) {
        ruleCounts[msg.id] = (ruleCounts[msg.id] ?? 0) + 1

        // Attack category from first 3 digits of rule ID
        const prefix = msg.id.slice(0, 3)
        const category = ATTACK_CATEGORIES[prefix]
        if (category) {
          attackCats[category] = (attackCats[category] ?? 0) + 1
        }
      }
    }
  }

  const uniqueIPs = new Set(events.map((e) => e.clientIp).filter(Boolean)).size

  const stats: ModSecData['stats'] = {
    totalEvents: events.length,
    blockedRequests,
    uniqueIPs,
    severityCounts,
    topRules: topN(ruleCounts, 20),
    topIPs: topN(ipCounts, 20),
    attackCategories: attackCats,
  }
  if (firstTimestamp && lastTimestamp) {
    stats.timeRange = { start: firstTimestamp, end: lastTimestamp }
  }

  return {
    type: 'modsec',
    events,
    stats,
  }
}

function topN(map: Record<string, number>, n: number): Record<string, number> {
  const sorted = Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
  return Object.fromEntries(sorted)
}
