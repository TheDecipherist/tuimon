import type { LayoutConfig, WidgetConfig } from '../layout/types.js'
import type { TableData, LogData, ModSecData, ParsedData } from './types.js'

function titleFromFilename(filePath: string): string {
  const name = filePath.split('/').pop()?.split('\\').pop() ?? 'Data'
  const base = name.replace(/\.[^.]+$/, '')
  return base
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function autoLayout(data: ParsedData, filePath?: string): LayoutConfig {
  const title = filePath ? titleFromFilename(filePath) : 'TuiMon'

  switch (data.type) {
    case 'table':
      return tableLayout(data, title)
    case 'log':
      return logLayout(data, title)
    case 'modsec':
      return modsecLayout(data, title)
    case 'live':
      return liveLayout(title)
  }
}

// ─── Table layout (JSON/CSV) ─────────────────────────────────────────────────

function tableLayout(data: TableData, title: string): LayoutConfig {
  const stats: WidgetConfig[] = [
    { id: '_rows', label: 'Total Rows', type: 'stat' },
    { id: '_cols', label: 'Columns', type: 'stat' },
  ]

  // Add numeric column summaries (max 2 more stat cards)
  for (const col of data.meta.numericColumns.slice(0, 2)) {
    stats.push({ id: `_avg_${col}`, label: `Avg ${col}`, type: 'stat' })
  }

  const panels: WidgetConfig[] = [
    { id: '_table', label: 'Data', type: 'table' as WidgetConfig['type'], span: 2 },
  ]

  // Bar chart for first numeric column grouped by first categorical
  if (data.meta.numericColumns.length > 0 && data.meta.categoricalColumns.length > 0) {
    panels.push({
      id: '_chart_bar',
      label: `${data.meta.numericColumns[0]} by ${data.meta.categoricalColumns[0]}`,
      type: 'bar',
    })
  }

  // Doughnut for first boolean column
  if (data.meta.booleanColumns.length > 0) {
    panels.push({
      id: `_chart_bool`,
      label: `${data.meta.booleanColumns[0]} Distribution`,
      type: 'doughnut',
    })
  }

  // Doughnut for first categorical column
  if (data.meta.categoricalColumns.length > 0) {
    panels.push({
      id: '_chart_cat',
      label: `${data.meta.categoricalColumns[0]} Distribution`,
      type: 'doughnut',
    })
  }

  return { title, stats, panels }
}

// ─── Log layouts ─────────────────────────────────────────────────────────────

function logLayout(data: LogData, title: string): LayoutConfig {
  switch (data.format) {
    case 'nginx':
      return nginxLayout(data, title)
    case 'json':
      return jsonLogLayout(data, title)
    case 'plain':
    default:
      return plainLogLayout(data, title)
  }
}

function nginxLayout(data: LogData, title: string): LayoutConfig {
  const stats: WidgetConfig[] = [
    { id: '_requests', label: 'Total Requests', type: 'stat' },
    { id: '_errors', label: 'Errors (4xx/5xx)', type: 'stat' },
    { id: '_uniqueIPs', label: 'Unique IPs', type: 'stat' },
  ]

  const panels: WidgetConfig[] = [
    { id: '_table', label: 'Request Log', type: 'table' as WidgetConfig['type'], span: 2 },
    { id: '_statusCodes', label: 'Status Codes', type: 'doughnut' },
    { id: '_methods', label: 'HTTP Methods', type: 'bar' },
  ]

  return { title: title || 'Access Log', stats, panels }
}

function jsonLogLayout(data: LogData, title: string): LayoutConfig {
  const stats: WidgetConfig[] = [
    { id: '_total', label: 'Total Entries', type: 'stat' },
    { id: '_errors', label: 'Errors', type: 'stat' },
    { id: '_warnings', label: 'Warnings', type: 'stat' },
  ]

  const panels: WidgetConfig[] = [
    { id: '_levelDist', label: 'Level Distribution', type: 'doughnut' },
    { id: '_latestEntries', label: 'Latest Entries', type: 'event-log', span: 2 },
  ]

  return { title: title || 'Application Log', stats, panels }
}

function plainLogLayout(_data: LogData, title: string): LayoutConfig {
  const stats: WidgetConfig[] = [
    { id: '_lines', label: 'Total Lines', type: 'stat' },
  ]

  const panels: WidgetConfig[] = [
    { id: '_log', label: 'Log Output', type: 'event-log', span: 2 },
  ]

  return { title: title || 'Log', stats, panels }
}

// ─── ModSecurity layout ──────────────────────────────────────────────────────

function modsecLayout(data: ModSecData, title: string): LayoutConfig {
  const stats: WidgetConfig[] = [
    { id: '_events', label: 'Security Events', type: 'stat' },
    { id: '_blocked', label: 'Blocked', type: 'gauge' },
    { id: '_attackers', label: 'Unique Attackers', type: 'stat' },
    { id: '_critical', label: 'Critical', type: 'stat' },
  ]

  const panels: WidgetConfig[] = [
    { id: '_severityDist', label: 'Severity Distribution', type: 'doughnut' },
    { id: '_categories', label: 'Attack Categories', type: 'doughnut' },
    { id: '_topRules', label: 'Top Rules Triggered', type: 'bar' },
    { id: '_topIPs', label: 'Top Attacker IPs', type: 'bar' },
    { id: '_latestEvents', label: 'Latest Events', type: 'event-log', span: 2 },
  ]

  return { title: title || 'ModSecurity', stats, panels }
}

// ─── Live data layout (auto-detect from first data call) ─────────────────────

function liveLayout(title: string): LayoutConfig {
  // Placeholder with a single stat so validateLayout doesn't throw
  return { title, stats: [{ id: '_status', label: 'Status', type: 'stat' }] }
}

// ─── Convert parsed data to render-ready widget data ─────────────────────────

export function dataToWidgetData(data: ParsedData): Record<string, unknown> {
  switch (data.type) {
    case 'table':
      return tableToWidgetData(data)
    case 'log':
      return logToWidgetData(data)
    case 'modsec':
      return modsecToWidgetData(data)
    case 'live':
      return {}
  }
}

function tableToWidgetData(data: TableData): Record<string, unknown> {
  const result: Record<string, unknown> = {
    _rows: data.meta.totalRows,
    _cols: data.columns.length,
    _table: { columns: data.columns, rows: data.rows },
  }

  // Numeric column averages
  for (const col of data.meta.numericColumns.slice(0, 2)) {
    const values = data.rows.map((r) => Number(r[col])).filter((v) => !isNaN(v))
    const avg = values.length > 0 ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100 : 0
    result[`_avg_${col}`] = avg
  }

  // Bar chart: first numeric by first categorical
  if (data.meta.numericColumns.length > 0 && data.meta.categoricalColumns.length > 0) {
    const numCol = data.meta.numericColumns[0]!
    const catCol = data.meta.categoricalColumns[0]!
    const grouped: Record<string, number> = {}
    for (const row of data.rows) {
      const cat = String(row[catCol] ?? 'unknown')
      const val = Number(row[numCol] ?? 0)
      grouped[cat] = (grouped[cat] ?? 0) + val
    }
    result['_chart_bar'] = grouped
  }

  // Boolean distribution
  if (data.meta.booleanColumns.length > 0) {
    const col = data.meta.booleanColumns[0]!
    let trueCount = 0
    let falseCount = 0
    for (const row of data.rows) {
      if (row[col]) trueCount++
      else falseCount++
    }
    result['_chart_bool'] = { True: trueCount, False: falseCount }
  }

  // Categorical distribution
  if (data.meta.categoricalColumns.length > 0) {
    const col = data.meta.categoricalColumns[0]!
    const counts: Record<string, number> = {}
    for (const row of data.rows) {
      const val = String(row[col] ?? 'unknown')
      counts[val] = (counts[val] ?? 0) + 1
    }
    result['_chart_cat'] = counts
  }

  return result
}

function logToWidgetData(data: LogData): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  if (data.format === 'nginx') {
    result['_requests'] = data.stats.totalLines
    result['_errors'] = data.stats.errorCount ?? 0
    result['_uniqueIPs'] = data.stats.topIPs ? Object.keys(data.stats.topIPs).length : 0
    result['_statusCodes'] = data.stats.statusCodes ?? {}
    result['_methods'] = data.stats.methods ?? {}
    // Table with all parsed entries
    result['_table'] = {
      columns: ['Timestamp', 'IP', 'Method', 'Path', 'Status', 'Bytes'],
      rows: data.entries.map((e) => ({
        Timestamp: e.timestamp ?? '',
        IP: e.ip ?? '',
        Method: e.method ?? '',
        Path: e.path ?? '',
        Status: e.status ?? 0,
        Bytes: e.bytes ?? 0,
      })),
    }
  } else if (data.format === 'json') {
    const levels: Record<string, number> = {}
    let errors = 0
    let warnings = 0
    for (const e of data.entries) {
      const level = (e.level ?? 'info').toLowerCase()
      levels[level] = (levels[level] ?? 0) + 1
      if (level === 'error') errors++
      if (level === 'warn' || level === 'warning') warnings++
    }
    result['_total'] = data.stats.totalLines
    result['_errors'] = errors
    result['_warnings'] = warnings
    result['_levelDist'] = levels
    result['_latestEntries'] = data.entries.slice(-20).reverse().map((e) => {
      const level = (e.level ?? 'info').toLowerCase()
      const type = level === 'error' ? 'error' as const : level.startsWith('warn') ? 'warning' as const : 'info' as const
      return { text: e.message ?? e.raw, type, time: e.timestamp ?? '' }
    })
  } else {
    result['_lines'] = data.stats.totalLines
    result['_log'] = data.entries.slice(-30).reverse().map((e) => e.raw)
  }

  return result
}

function modsecToWidgetData(data: ModSecData): Record<string, unknown> {
  const total = data.stats.totalEvents
  return {
    _events: total,
    _blocked: total > 0 ? { value: data.stats.blockedRequests, max: total } : 0,
    _attackers: data.stats.uniqueIPs,
    _critical: data.stats.severityCounts['CRITICAL'] ?? 0,
    _severityDist: data.stats.severityCounts,
    _categories: data.stats.attackCategories,
    _topRules: data.stats.topRules,
    _topIPs: data.stats.topIPs,
    _latestEvents: data.events.slice(-20).reverse().map((e) => {
      const sev = e.messages[0]?.severity?.toUpperCase() ?? 'NOTICE'
      const type = sev === 'CRITICAL' || sev === 'ERROR' ? 'error' as const
        : sev === 'WARNING' ? 'warning' as const
        : sev === 'NOTICE' ? 'success' as const
        : 'info' as const
      const ruleId = e.messages[0]?.id ?? '?'
      const msg = e.messages[0]?.msg ?? 'No message'
      return { text: `[${ruleId}] ${e.clientIp} ${e.method} ${e.uri} — ${msg}`, type, time: e.timestamp }
    }),
  }
}
