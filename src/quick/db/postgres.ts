import { createRequire } from 'node:module'
import { join } from 'node:path'
import type { TableData } from '../types.js'
import { detectMeta } from '../parsers/detect-meta.js'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PgQueryOpts {
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

export async function queryPostgres(opts: PgQueryOpts): Promise<TableData> {
  const require = createRequire(join(process.cwd(), 'package.json'))
  const pg = require('pg') as { Client: new (config: { connectionString: string; statement_timeout: number }) => {
    connect(): Promise<void>
    query(sql: string): Promise<{ rows: Record<string, unknown>[]; fields: { name: string }[] }>
    end(): Promise<void>
  }}

  let sql: string

  if (isTableName(opts.query)) {
    if (!TABLE_NAME_RE.test(opts.query)) {
      throw new Error(`Invalid table name: "${opts.query}". Table names must match /^[a-zA-Z_][a-zA-Z0-9_]*$/`)
    }
    sql = `SELECT * FROM ${opts.query} LIMIT ${opts.limit}`
  } else {
    sql = opts.query
  }

  const client = new pg.Client({
    connectionString: opts.uri,
    statement_timeout: 10000,
  })

  try {
    await client.connect()
    const result = await client.query(sql)

    const columns = result.fields.map((f) => f.name)
    const rows = result.rows
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
    await client.end()
  }
}
