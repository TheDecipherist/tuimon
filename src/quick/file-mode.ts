import { readFileSync } from 'node:fs'
import { watch } from 'chokidar'
import type { ParsedData } from './types.js'
import type { LayoutConfig, WidgetConfig } from '../layout/types.js'
import type { TuiMonDashboard } from '../types.js'
import { detectInputType, detectLogFormat } from './detect.js'
import { parseJsonFile } from './parsers/json.js'
import { parseCsvFile } from './parsers/csv.js'
import { parseLogFile } from './parsers/log.js'
import { parseModSecFile } from './parsers/modsec.js'
import { autoLayout, dataToWidgetData } from './auto-layout.js'
import tuimon from '../index.js'

export interface FileModeOptions {
  columns?: string[] | undefined
}

function parseFile(filePath: string): ParsedData {
  const inputType = detectInputType(filePath)
  switch (inputType) {
    case 'json':
      return parseJsonFile(filePath)
    case 'csv':
      return parseCsvFile(filePath)
    case 'log': {
      const content = readFileSync(filePath, 'utf-8')
      const format = detectLogFormat(content)
      if (format === 'modsec') return parseModSecFile(filePath)
      return parseLogFile(filePath)
    }
    default:
      return parseLogFile(filePath)
  }
}

function hasTableData(data: ParsedData): boolean {
  return data.type === 'table'
    || (data.type === 'log' && data.format === 'nginx')
    || data.type === 'modsec'
}

function getFullTableData(data: ParsedData): Record<string, unknown> {
  if (data.type === 'table') {
    return { _table_full: { columns: data.columns, rows: data.rows } }
  }
  if (data.type === 'log' && data.format === 'nginx') {
    return {
      _table_full: {
        columns: ['Timestamp', 'IP', 'Method', 'Path', 'Status', 'Bytes'],
        rows: data.entries.map((e) => ({
          Timestamp: e.timestamp ?? '', IP: e.ip ?? '', Method: e.method ?? '',
          Path: e.path ?? '', Status: e.status ?? 0, Bytes: e.bytes ?? 0,
        })),
      },
    }
  }
  if (data.type === 'modsec') {
    return {
      _table_full: {
        columns: ['Time', 'IP', 'Method', 'URI', 'Code', 'Rule', 'Severity', 'Message'],
        rows: data.events.map((e) => ({
          Time: e.timestamp, IP: e.clientIp, Method: e.method, URI: e.uri,
          Code: e.httpCode, Rule: e.messages[0]?.id ?? '',
          Severity: e.messages[0]?.severity ?? '', Message: e.messages[0]?.msg ?? '',
        })),
      },
    }
  }
  return {}
}

function filterTableColumns(widgetData: Record<string, unknown>, columns: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = { ...widgetData }
  for (const [key, value] of Object.entries(result)) {
    if (value && typeof value === 'object' && 'columns' in value && 'rows' in value) {
      const table = value as { columns: string[]; rows: Record<string, unknown>[] }
      const filtered = {
        columns: columns.filter((c) => table.columns.includes(c)),
        rows: table.rows.map((row) => {
          const r: Record<string, unknown> = {}
          for (const c of columns) { if (c in row) r[c] = row[c] }
          return r
        }),
      }
      if (filtered.columns.length > 0) result[key] = filtered
    }
  }
  return result
}

function titleFromFilename(filePath: string): string {
  const name = filePath.split('/').pop()?.split('\\').pop() ?? 'Data'
  return name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export async function startFileMode(filePath: string, opts?: FileModeOptions): Promise<void> {
  const columns = opts?.columns
  let data = parseFile(filePath)
  const title = titleFromFilename(filePath)
  const overviewLayout = autoLayout(data, filePath)
  const showTable = hasTableData(data)

  let dash: TuiMonDashboard

  // Always merge overview + table data so both pages can render
  function getAllData(): Record<string, unknown> {
    let d = dataToWidgetData(data)
    if (showTable) d = { ...d, ...getFullTableData(data) }
    if (columns) d = filterTableColumns(d, columns)
    return d
  }

  function reload(): void {
    data = parseFile(filePath)
  }

  const pages: Record<string, {
    html: string; default?: true; label?: string; shortcut?: string
    layout?: LayoutConfig
    keys?: Record<string, { label: string; action: () => void | Promise<void> }>
  }> = {
    overview: {
      html: '',
      default: true,
      label: 'Overview',
      layout: overviewLayout,
      keys: {
        F5: { label: 'Reload', action: async () => { reload(); await dash.render(getAllData()) } },
        F10: { label: 'Quit', action: () => process.exit(0) },
      },
    },
  }

  if (showTable) {
    pages['datatable'] = {
      html: '',
      shortcut: 'd',
      label: 'Data Table',
      layout: {
        title: `${title} — Data`,
        panels: [{ id: '_table_full', label: 'All Data', type: 'table' as WidgetConfig['type'], span: 2 }],
      },
      keys: {
        F5: { label: 'Reload', action: async () => { reload(); await dash.render(getAllData()) } },
        F10: { label: 'Quit', action: () => process.exit(0) },
      },
    }

    pages['overview']!.keys!['F3'] = {
      label: 'Data Table [D]',
      action: () => {},  // hint only — D shortcut handles navigation
    }
  }

  dash = await tuimon.start({
    pages: pages as Parameters<typeof tuimon.start>[0]['pages'],
    renderDelay: 0,
  })

  await dash.render(getAllData())

  const watcher = watch(filePath, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200 },
  })

  watcher.on('change', async () => {
    try {
      reload()
      await dash.render(getAllData())
    } catch (err) {
      console.error('[tuimon] file reload error:', err)
    }
  })

  process.once('beforeExit', () => { void watcher.close() })
}
