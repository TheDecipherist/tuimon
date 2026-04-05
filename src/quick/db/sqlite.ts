import { createRequire } from 'node:module'
import { join } from 'node:path'
import type { TableData } from '../types.js'
import { detectMeta } from '../parsers/detect-meta.js'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SqliteQueryOpts {
  filePath: string
  query: string
  limit: number
}

// ─── Table name validation ───────────────────────────────────────────────────

const TABLE_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/

function isTableName(query: string): boolean {
  return !query.includes(' ') && TABLE_NAME_RE.test(query)
}

// ─── Query ───────────────────────────────────────────────────────────────────

export async function querySqlite(opts: SqliteQueryOpts): Promise<TableData> {
  const require = createRequire(join(process.cwd(), 'package.json'))
  const Database = require('better-sqlite3') as new (
    path: string,
    options: { readonly: boolean },
  ) => {
    prepare(sql: string): { all(): Record<string, unknown>[] }
    close(): void
  }

  let sql: string

  if (isTableName(opts.query)) {
    if (!TABLE_NAME_RE.test(opts.query)) {
      throw new Error(`Invalid table name: "${opts.query}". Table names must match /^[a-zA-Z_][a-zA-Z0-9_]*$/`)
    }
    sql = `SELECT * FROM ${opts.query} LIMIT ${opts.limit}`
  } else {
    sql = opts.query
  }

  const db = new Database(opts.filePath, { readonly: true })

  try {
    const rows = db.prepare(sql).all()

    // Derive columns from first row, or empty if no rows
    const columns = rows.length > 0 ? Object.keys(rows[0] as Record<string, unknown>) : []
    const meta = detectMeta(columns, rows)

    return {
      type: 'table',
      columns,
      rows,
      meta: {
        totalRows: rows.length,
        ...meta,
      },
    }
  } finally {
    db.close()
  }
}
