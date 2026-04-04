export interface ColumnMeta {
  numericColumns: string[]
  booleanColumns: string[]
  categoricalColumns: string[]
}

export function detectMeta(columns: string[], rows: Record<string, unknown>[]): ColumnMeta {
  const numericColumns: string[] = []
  const booleanColumns: string[] = []
  const categoricalColumns: string[] = []

  for (const col of columns) {
    const values = rows.map((r) => r[col]).filter((v) => v !== null && v !== undefined && v !== '')

    if (values.length === 0) continue

    const allNumeric = values.every((v) => {
      if (typeof v === 'number') return true
      if (typeof v === 'string') return v.trim() !== '' && !isNaN(Number(v))
      return false
    })
    if (allNumeric) {
      numericColumns.push(col)
      continue
    }

    const allBoolean = values.every(
      (v) => typeof v === 'boolean' || v === 'true' || v === 'false',
    )
    if (allBoolean) {
      booleanColumns.push(col)
      continue
    }

    const stringValues = values.filter((v) => typeof v === 'string') as string[]
    if (stringValues.length === values.length) {
      const unique = new Set(stringValues)
      if (unique.size < 10) {
        categoricalColumns.push(col)
      }
    }
  }

  return { numericColumns, booleanColumns, categoricalColumns }
}
