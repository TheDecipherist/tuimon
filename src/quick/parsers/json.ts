import { readFileSync } from 'node:fs'
import type { TableData } from '../types.js'
import { detectMeta } from './detect-meta.js'

const MAX_ROWS = 1000

export function parseJsonFile(filePath: string): TableData {
  const content = readFileSync(filePath, 'utf-8').trim()

  if (!content) {
    throw new Error(`File is empty: ${filePath}`)
  }

  let rows: Record<string, unknown>[]

  // Try standard JSON first (array or object)
  try {
    const parsed = JSON.parse(content)

    if (Array.isArray(parsed)) {
      if (parsed.length === 0) {
        throw new Error(`JSON array is empty: ${filePath}`)
      }
      if (typeof parsed[0] !== 'object' || parsed[0] === null) {
        throw new Error(`JSON array must contain objects, got ${typeof parsed[0]}`)
      }
      rows = parsed as Record<string, unknown>[]
    } else if (typeof parsed === 'object' && parsed !== null) {
      rows = [parsed as Record<string, unknown>]
    } else {
      throw new Error(`Expected JSON object or array of objects, got ${typeof parsed}`)
    }
  } catch (jsonError) {
    // Try JSONL: one JSON object per line
    const lines = content.split('\n').filter((line) => line.trim() !== '')
    const parsed: Record<string, unknown>[] = []

    for (let i = 0; i < lines.length; i++) {
      try {
        const obj = JSON.parse(lines[i] ?? '')
        if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
          throw new Error(`JSONL line ${i + 1} is not an object`)
        }
        parsed.push(obj as Record<string, unknown>)
      } catch {
        throw new Error(
          `Failed to parse file as JSON or JSONL: ${filePath}. ` +
            `JSON error: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}. ` +
            `JSONL failed at line ${i + 1}.`,
        )
      }
    }

    if (parsed.length === 0) {
      throw new Error(`No valid JSONL entries found in: ${filePath}`)
    }

    rows = parsed
  }

  // Cap rows for memory safety
  const totalRows = rows.length
  if (rows.length > MAX_ROWS) {
    console.warn(
      `Warning: File ${filePath} contains ${rows.length} rows, truncating to ${MAX_ROWS}`,
    )
    rows = rows.slice(0, MAX_ROWS)
  }

  const firstRow = rows[0]
  if (!firstRow) throw new Error(`No rows found in: ${filePath}`)
  const columns = Object.keys(firstRow)
  const meta = detectMeta(columns, rows)

  return {
    type: 'table',
    columns,
    rows,
    meta: {
      totalRows,
      ...meta,
    },
  }
}

// detectMeta is imported from ./detect-meta.js
