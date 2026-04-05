import { createRequire } from 'node:module'
import { join } from 'node:path'
import type { TableData } from '../types.js'
import { detectMeta } from '../parsers/detect-meta.js'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MysqlQueryOpts {
  uri: string
  query: string
  limit: number
}

// ─── Table name validation ───────────────────────────────────────────────────

const TABLE_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/

function isTableName(query: string): boolean {
  return !query.includes(' ') && TABLE_NAME_RE.test(query)
}

// ─── Query ───────────────────────────────────────────────────────────────────

export async function queryMysql(opts: MysqlQueryOpts): Promise<TableData> {
  const require = createRequire(join(process.cwd(), 'package.json'))
  const mysql = require('mysql2/promise') as {
    createConnection(uri: string): Promise<{
      execute(sql: string): Promise<[Record<string, unknown>[], { name: string }[]]>
      end(): Promise<void>
    }>
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

  const conn = await mysql.createConnection(opts.uri)

  try {
    const [rows, fields] = await conn.execute(sql)

    const columns = fields.map((f) => f.name)
    const typedRows = rows as Record<string, unknown>[]
    const meta = detectMeta(columns, typedRows)

    return {
      type: 'table',
      columns,
      rows: typedRows,
      meta: {
        totalRows: typedRows.length,
        ...meta,
      },
    }
  } finally {
    await conn.end()
  }
}
