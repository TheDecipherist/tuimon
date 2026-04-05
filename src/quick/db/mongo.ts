import { createRequire } from 'node:module'
import { join } from 'node:path'
import type { TableData } from '../types.js'
import { detectMeta } from '../parsers/detect-meta.js'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MongoQueryOpts {
  uri: string
  collection: string
  filter?: string | undefined
  sort?: string | undefined
  limit: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isObjectId(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>)['toHexString'] === 'function'
  )
}

function flattenObject(
  obj: Record<string, unknown>,
  prefix: string,
  depth: number,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key

    if (isObjectId(value)) {
      result[fullKey] = String(value)
    } else if (value instanceof Date) {
      result[fullKey] = value.toISOString()
    } else if (
      depth < 2 &&
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      Object.assign(result, flattenObject(value as Record<string, unknown>, fullKey, depth + 1))
    } else {
      result[fullKey] = value
    }
  }

  return result
}

// ─── Query ───────────────────────────────────────────────────────────────────

export async function queryMongo(opts: MongoQueryOpts): Promise<TableData> {
  const require = createRequire(join(process.cwd(), 'package.json'))
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const mongodb = require('mongodb')
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
  const client = new mongodb.MongoClient(opts.uri, {
    serverSelectionTimeoutMS: 10000,
  })

  try {
    await client.connect()

    // Extract db name from URI path
    const url = new URL(opts.uri.replace('mongodb+srv://', 'https://').replace('mongodb://', 'https://'))
    const dbName = url.pathname.slice(1).split('?')[0]
    if (!dbName) {
      throw new Error('No database name found in MongoDB URI. Include it in the URI path.')
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const db = client.db(dbName)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const collection = db.collection(opts.collection)

    const filter = opts.filter ? (JSON.parse(opts.filter) as Record<string, unknown>) : {}
    const sort = opts.sort ? (JSON.parse(opts.sort) as Record<string, unknown>) : {}

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const docs: Record<string, unknown>[] = await collection.find(filter).sort(sort).limit(opts.limit).toArray()

    const rows: Record<string, unknown>[] = docs.map((doc: Record<string, unknown>) =>
      flattenObject(doc, '', 0),
    )

    // Collect all unique columns across all rows
    const columnSet = new Set<string>()
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        columnSet.add(key)
      }
    }
    const columns = [...columnSet]

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
    await client.close()
  }
}
