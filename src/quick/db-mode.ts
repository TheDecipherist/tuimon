import type { TableData } from './types.js'
import type { TuiMonDashboard } from '../types.js'
import type { LayoutConfig, WidgetConfig } from '../layout/types.js'
import { loadConfig } from '../config.js'
import { detectDbConnection, type DbType } from './db/detect.js'
import { autoLayout, dataToWidgetData } from './auto-layout.js'
import tuimon from '../index.js'

export interface DbModeOptions {
  target: string               // table name, collection name, or SQL query
  uri?: string | undefined
  envVarName?: string | undefined
  query?: string | undefined   // MongoDB filter JSON
  sort?: string | undefined    // MongoDB sort JSON
  limit?: number | undefined
  watch?: boolean | undefined
  interval?: number | undefined
  columns?: string[] | undefined
}

function isQuery(target: string): boolean {
  const upper = target.trim().toUpperCase()
  return upper.includes(' ') && /^(SELECT|INSERT|UPDATE|DELETE|WITH|EXPLAIN)\b/.test(upper)
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

async function executeQuery(type: DbType, opts: DbModeOptions, limit: number, uri: string): Promise<TableData> {
  switch (type) {
    case 'mongodb': {
      const { queryMongo } = await import('./db/mongo.js')
      return queryMongo({
        uri,
        collection: opts.target,
        filter: opts.query,
        sort: opts.sort,
        limit,
      })
    }
    case 'postgres': {
      const { queryPostgres } = await import('./db/postgres.js')
      return queryPostgres({ uri, query: opts.target, limit })
    }
    case 'mysql': {
      const { queryMysql } = await import('./db/mysql.js')
      return queryMysql({ uri, query: opts.target, limit })
    }
    case 'sqlite': {
      const { querySqlite } = await import('./db/sqlite.js')
      return querySqlite({ filePath: uri, query: opts.target, limit })
    }
  }
}

export async function startDbMode(opts: DbModeOptions): Promise<void> {
  const config = loadConfig()
  const limit = opts.limit ?? config.db.defaultLimit
  const watchInterval = opts.interval ?? config.db.watchInterval

  // Detect connection
  let connection
  try {
    connection = detectDbConnection({
      uri: opts.uri,
      envVarName: opts.envVarName,
      configEnvVar: config.db.envVar,
      configUri: config.db.uri,
    })
  } catch (err) {
    console.error(`[tuimon] ${err instanceof Error ? err.message : String(err)}`)
    console.error('')
    console.error('  Fix: set your connection string:')
    console.error('    tuimon config db.envVar YOUR_DB_ENV_VAR')
    console.error('    or: tuimon db <table> --uri "your://connection/string"')
    console.error('    or: tuimon db <table> --env YOUR_ENV_VAR')
    process.exit(1)
  }

  const { type, uri } = connection
  const dbLabel = type.charAt(0).toUpperCase() + type.slice(1)
  const targetLabel = isQuery(opts.target) ? 'Query' : opts.target

  console.log(`[tuimon] Connecting to ${dbLabel}...`)

  // Execute initial query
  let data: TableData
  try {
    data = await executeQuery(type, opts, limit, uri)
  } catch (err) {
    console.error(`[tuimon] Query failed: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }

  console.log(`[tuimon] ${data.meta.totalRows} rows from ${targetLabel}`)

  // Build layouts
  const overviewLayout = autoLayout(data, `${dbLabel}: ${targetLabel}`)
  const tableLayout: LayoutConfig = {
    title: `${dbLabel}: ${targetLabel}`,
    panels: [{ id: '_table_full', label: 'All Data', type: 'table' as WidgetConfig['type'], span: 2 }],
  }

  let dash: TuiMonDashboard

  function getAllData(): Record<string, unknown> {
    let d = dataToWidgetData(data)
    d['_table_full'] = { columns: data.columns, rows: data.rows }
    if (opts.columns) d = filterTableColumns(d, opts.columns)
    return d
  }

  async function refresh(): Promise<void> {
    try {
      data = await executeQuery(type, opts, limit, uri)
      await dash.render(getAllData())
    } catch (err) {
      console.error(`[tuimon] Query error: ${err instanceof Error ? err.message : String(err)}`)
    }
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
        F5: { label: 'Refresh', action: refresh },
        F3: { label: 'Data Table [D]', action: () => {} },
        F10: { label: 'Quit', action: () => process.exit(0) },
      },
    },
    datatable: {
      html: '',
      shortcut: 'd',
      label: 'Data Table',
      layout: tableLayout,
      keys: {
        F5: { label: 'Refresh', action: refresh },
        F10: { label: 'Quit', action: () => process.exit(0) },
      },
    },
  }

  if (opts.watch) {
    dash = await tuimon.start({
      pages: pages as Parameters<typeof tuimon.start>[0]['pages'],
      refresh: watchInterval,
      data: async () => {
        data = await executeQuery(type, opts, limit, uri)
        return getAllData()
      },
      renderDelay: 0,
    })
  } else {
    dash = await tuimon.start({
      pages: pages as Parameters<typeof tuimon.start>[0]['pages'],
      renderDelay: 0,
    })
    await dash.render(getAllData())
  }
}
