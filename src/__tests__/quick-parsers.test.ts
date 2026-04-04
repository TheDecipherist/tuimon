import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { parseJsonFile } from '../quick/parsers/json.js'
import { parseCsvFile } from '../quick/parsers/csv.js'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

let tmpDir: string

beforeEach(() => {
  tmpDir = join(tmpdir(), `tuimon-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(tmpDir, { recursive: true })
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

// ─── JSON Parser ──────────────────────────────────────────────────────────────

describe('parseJsonFile', () => {
  it('parses array of objects', () => {
    const file = join(tmpDir, 'data.json')
    writeFileSync(
      file,
      JSON.stringify([
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
      ]),
    )

    const result = parseJsonFile(file)
    expect(result.type).toBe('table')
    expect(result.columns).toEqual(['name', 'age'])
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]).toEqual({ name: 'Alice', age: 30 })
    expect(result.meta.totalRows).toBe(2)
  })

  it('parses single object and wraps in array', () => {
    const file = join(tmpDir, 'single.json')
    writeFileSync(file, JSON.stringify({ host: 'localhost', port: 8080 }))

    const result = parseJsonFile(file)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toEqual({ host: 'localhost', port: 8080 })
    expect(result.columns).toEqual(['host', 'port'])
  })

  it('parses JSONL format', () => {
    const file = join(tmpDir, 'data.jsonl')
    const lines = [
      JSON.stringify({ id: 1, status: 'ok' }),
      JSON.stringify({ id: 2, status: 'err' }),
      JSON.stringify({ id: 3, status: 'ok' }),
    ]
    writeFileSync(file, lines.join('\n'))

    const result = parseJsonFile(file)
    expect(result.rows).toHaveLength(3)
    expect(result.rows[0]).toEqual({ id: 1, status: 'ok' })
    expect(result.meta.totalRows).toBe(3)
  })

  it('detects numeric columns', () => {
    const file = join(tmpDir, 'numeric.json')
    writeFileSync(
      file,
      JSON.stringify([
        { name: 'A', score: 10, rank: 1 },
        { name: 'B', score: 20, rank: 2 },
      ]),
    )

    const result = parseJsonFile(file)
    expect(result.meta.numericColumns).toContain('score')
    expect(result.meta.numericColumns).toContain('rank')
    expect(result.meta.numericColumns).not.toContain('name')
  })

  it('detects boolean columns', () => {
    const file = join(tmpDir, 'bool.json')
    writeFileSync(
      file,
      JSON.stringify([
        { name: 'X', active: true },
        { name: 'Y', active: false },
      ]),
    )

    const result = parseJsonFile(file)
    expect(result.meta.booleanColumns).toContain('active')
    expect(result.meta.booleanColumns).not.toContain('name')
  })

  it('detects categorical columns with < 10 unique values', () => {
    const file = join(tmpDir, 'cat.json')
    const rows = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      color: ['red', 'green', 'blue'][i % 3],
    }))
    writeFileSync(file, JSON.stringify(rows))

    const result = parseJsonFile(file)
    expect(result.meta.categoricalColumns).toContain('color')
  })

  it('caps at 1000 rows', () => {
    const file = join(tmpDir, 'big.json')
    const rows = Array.from({ length: 1500 }, (_, i) => ({ id: i, val: `row-${i}` }))
    writeFileSync(file, JSON.stringify(rows))

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = parseJsonFile(file)
    expect(result.rows).toHaveLength(1000)
    expect(result.meta.totalRows).toBe(1500)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('truncating to 1000'))
    warnSpy.mockRestore()
  })

  it('throws on invalid JSON', () => {
    const file = join(tmpDir, 'bad.json')
    writeFileSync(file, '{not valid json!!!}')

    expect(() => parseJsonFile(file)).toThrow()
  })
})

// ─── CSV Parser ───────────────────────────────────────────────────────────────

describe('parseCsvFile', () => {
  it('parses comma-delimited CSV', () => {
    const file = join(tmpDir, 'data.csv')
    writeFileSync(file, 'name,age,city\nAlice,30,NYC\nBob,25,LA')

    const result = parseCsvFile(file)
    expect(result.type).toBe('table')
    expect(result.columns).toEqual(['name', 'age', 'city'])
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]).toEqual({ name: 'Alice', age: 30, city: 'NYC' })
  })

  it('parses tab-delimited TSV', () => {
    const file = join(tmpDir, 'data.tsv')
    writeFileSync(file, 'host\tport\tstatus\nlocalhost\t8080\tup\nremote\t3000\tdown')

    const result = parseCsvFile(file)
    expect(result.columns).toEqual(['host', 'port', 'status'])
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]).toEqual({ host: 'localhost', port: 8080, status: 'up' })
  })

  it('auto-detects semicolon delimiter', () => {
    const file = join(tmpDir, 'semi.csv')
    writeFileSync(file, 'a;b;c\n1;2;3\n4;5;6')

    const result = parseCsvFile(file)
    expect(result.columns).toEqual(['a', 'b', 'c'])
    expect(result.rows[0]).toEqual({ a: 1, b: 2, c: 3 })
  })

  it('handles quoted fields with commas', () => {
    const file = join(tmpDir, 'quoted.csv')
    writeFileSync(file, 'name,address,zip\nAlice,"123 Main St, Apt 4",10001\nBob,"456 Oak Ave, Suite 2",90210')

    const result = parseCsvFile(file)
    expect(result.rows[0]).toEqual({
      name: 'Alice',
      address: '123 Main St, Apt 4',
      zip: 10001,
    })
    expect(result.rows[1]).toEqual({
      name: 'Bob',
      address: '456 Oak Ave, Suite 2',
      zip: 90210,
    })
  })

  it('converts numeric strings to numbers', () => {
    const file = join(tmpDir, 'nums.csv')
    writeFileSync(file, 'label,value,pct\nfoo,100,3.14\nbar,200,2.71')

    const result = parseCsvFile(file)
    expect(result.rows[0].value).toBe(100)
    expect(result.rows[0].pct).toBe(3.14)
    expect(typeof result.rows[0].value).toBe('number')
  })

  it('detects column types in meta', () => {
    const file = join(tmpDir, 'types.csv')
    writeFileSync(
      file,
      'name,score,active,category\nAlice,95,true,A\nBob,88,false,B\nCarol,72,true,A',
    )

    const result = parseCsvFile(file)
    expect(result.meta.numericColumns).toContain('score')
    expect(result.meta.booleanColumns).toContain('active')
    expect(result.meta.categoricalColumns).toContain('category')
  })

  it('first row used as headers', () => {
    const file = join(tmpDir, 'headers.csv')
    writeFileSync(file, 'col_x,col_y,col_z\n1,2,3')

    const result = parseCsvFile(file)
    expect(result.columns).toEqual(['col_x', 'col_y', 'col_z'])
    expect(result.rows).toHaveLength(1)
  })
})
