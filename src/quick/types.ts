// ─── Input detection ─────────────────────────────────────────────────────────

export type InputType = 'json' | 'csv' | 'log' | 'module' | 'url' | 'stdin'

// ─── Parsed data shapes ─────────────────────────────────────────────────────

export interface TableData {
  type: 'table'
  columns: string[]
  rows: Record<string, unknown>[]
  meta: {
    totalRows: number
    numericColumns: string[]
    booleanColumns: string[]
    categoricalColumns: string[]
  }
}

export interface LogData {
  type: 'log'
  format: 'nginx' | 'json' | 'modsec' | 'plain'
  entries: LogEntry[]
  stats: {
    totalLines: number
    timeRange?: { start: string; end: string } | undefined
    statusCodes?: Record<string, number> | undefined
    methods?: Record<string, number> | undefined
    topEndpoints?: Record<string, number> | undefined
    topIPs?: Record<string, number> | undefined
    errorCount?: number | undefined
  }
}

export interface LogEntry {
  raw: string
  timestamp?: string | undefined
  ip?: string | undefined
  method?: string | undefined
  path?: string | undefined
  status?: number | undefined
  bytes?: number | undefined
  referer?: string | undefined
  userAgent?: string | undefined
  level?: string | undefined
  message?: string | undefined
}

export interface ModSecData {
  type: 'modsec'
  events: ModSecEvent[]
  stats: {
    totalEvents: number
    blockedRequests: number
    uniqueIPs: number
    severityCounts: Record<string, number>
    topRules: Record<string, number>
    topIPs: Record<string, number>
    attackCategories: Record<string, number>
    timeRange?: { start: string; end: string } | undefined
  }
}

export interface ModSecEvent {
  uniqueId: string
  timestamp: string
  clientIp: string
  clientPort?: number | undefined
  serverIp?: string | undefined
  serverPort?: number | undefined
  method: string
  uri: string
  protocol?: string | undefined
  httpCode: number
  messages: ModSecMessage[]
  action?: string | undefined
  phase?: number | undefined
  raw: string
}

export interface ModSecMessage {
  id: string
  msg: string
  severity: string
  tags?: string[] | undefined
  data?: string | undefined
}

export interface LiveData {
  type: 'live'
  getData: () => Record<string, unknown> | Promise<Record<string, unknown>>
  refresh?: number
  title?: string
}

export type ParsedData = TableData | LogData | ModSecData | LiveData
