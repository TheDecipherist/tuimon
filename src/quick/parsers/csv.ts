import { readFileSync } from 'node:fs'
import type { TableData } from '../types.js'
import { detectMeta } from './detect-meta.js'

const MAX_ROWS = 1000

const DELIMITERS = [',', '\t', ';', '|'] as const
type Delimiter = (typeof DELIMITERS)[number]

export function parseCsvFile(filePath: string): TableData {
  const content = readFileSync(filePath, 'utf-8').trim()

  if (!content) {
    throw new Error(`File is empty: ${filePath}`)
  }

  const lines = content.split(/\r?\n/)

  if (lines.length < 2) {
    throw new Error(`File must have at least a header row and one data row: ${filePath}`)
  }

  const delimiter = detectDelimiter(lines.slice(0, Math.min(5, lines.length)))
  const headerLine = lines[0] ?? ''
  const columns = parseRow(headerLine, delimiter)

  if (columns.length === 0) {
    throw new Error(`No columns found in header row: ${filePath}`)
  }

  const totalRows = lines.length - 1
  const rowLimit = Math.min(totalRows, MAX_ROWS)

  if (totalRows > MAX_ROWS) {
    console.warn(
      `Warning: File ${filePath} contains ${totalRows} rows, truncating to ${MAX_ROWS}`,
    )
  }

  const rows: Record<string, unknown>[] = []

  for (let i = 1; i <= rowLimit; i++) {
    const line = lines[i]
    if (!line || line.trim() === '') continue

    const values = parseRow(line, delimiter)
    const row: Record<string, unknown> = {}

    for (let c = 0; c < columns.length; c++) {
      const raw = values[c] ?? ''
      const colName = columns[c]
      if (colName !== undefined) {
        row[colName] = convertValue(raw)
      }
    }

    rows.push(row)
  }

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

function detectDelimiter(sampleLines: string[]): Delimiter {
  let bestDelimiter: Delimiter = ','
  let bestScore = -1

  for (const delim of DELIMITERS) {
    const counts = sampleLines.map((line) => countUnquoted(line, delim))

    // All lines should have the same count and at least 1
    const firstCount = counts[0] ?? 0
    if (firstCount === 0) continue

    const allSame = counts.every((c) => c === firstCount)
    const score = allSame ? firstCount * sampleLines.length : 0

    if (score > bestScore) {
      bestScore = score
      bestDelimiter = delim
    }
  }

  return bestDelimiter
}

/** Count occurrences of a delimiter outside of quoted fields */
function countUnquoted(line: string, delim: string): number {
  let count = 0
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') {
      inQuotes = !inQuotes
    } else if (line[i] === delim && !inQuotes) {
      count++
    }
  }

  return count
}

/** Parse a single row respecting quoted fields */
function parseRow(line: string, delimiter: Delimiter): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]

    if (inQuotes) {
      if (ch === '"') {
        // Check for escaped quote ("")
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'
          i++ // skip next quote
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === delimiter) {
        fields.push(current)
        current = ''
      } else {
        current += ch
      }
    }
  }

  fields.push(current)
  return fields
}

function convertValue(raw: string): unknown {
  const trimmed = raw.trim()

  if (trimmed === '') return ''

  // Boolean conversion
  const lower = trimmed.toLowerCase()
  if (lower === 'true' || lower === 'yes') return true
  if (lower === 'false' || lower === 'no') return false
  if (trimmed === '1' && raw.length === 1) {
    // Ambiguous: could be numeric 1. Prefer number.
  }
  if (trimmed === '0' && raw.length === 1) {
    // Same ambiguity. Prefer number.
  }

  // Numeric conversion
  if (trimmed !== '' && !isNaN(Number(trimmed))) {
    return Number(trimmed)
  }

  return trimmed
}

// detectMeta is imported from ./detect-meta.js
