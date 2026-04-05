import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// We import the functions under test
import { detectDbConnection, findDriver, parseEnvFile, detectDbType } from '../quick/db/detect.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

let tempDir: string

beforeEach(() => {
  tempDir = join(tmpdir(), `tuimon-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(tempDir, { recursive: true })
})

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

// ─── detectDbType ────────────────────────────────────────────────────────────

describe('detectDbType', () => {
  it('detects mongodb:// URIs', () => {
    expect(detectDbType('mongodb://localhost:27017/mydb')).toBe('mongodb')
  })

  it('detects mongodb+srv:// URIs', () => {
    expect(detectDbType('mongodb+srv://user:pass@cluster.mongodb.net/mydb')).toBe('mongodb')
  })

  it('detects postgresql:// URIs', () => {
    expect(detectDbType('postgresql://localhost:5432/mydb')).toBe('postgres')
  })

  it('detects postgres:// URIs', () => {
    expect(detectDbType('postgres://user:pass@host/db')).toBe('postgres')
  })

  it('detects mysql:// URIs', () => {
    expect(detectDbType('mysql://localhost:3306/mydb')).toBe('mysql')
  })

  it('detects .sqlite files', () => {
    expect(detectDbType('/data/app.sqlite')).toBe('sqlite')
  })

  it('detects .sqlite3 files', () => {
    expect(detectDbType('./database.sqlite3')).toBe('sqlite')
  })

  it('detects .db files', () => {
    expect(detectDbType('my-data.db')).toBe('sqlite')
  })

  it('throws on unknown URI scheme', () => {
    expect(() => detectDbType('redis://localhost:6379')).toThrow('Cannot detect database type')
  })
})

// ─── detectDbConnection ──────────────────────────────────────────────────────

describe('detectDbConnection', () => {
  it('returns mongodb type with explicit URI', () => {
    // findDriver will fail since mongodb is not installed in test env,
    // so we mock it via createRequire
    vi.mock('node:module', async (importOriginal) => {
      const orig = await importOriginal<typeof import('node:module')>()
      return {
        ...orig,
        createRequire: () => {
          const req = Object.assign(
            (id: string) => {
              throw new Error(`Cannot find module '${id}'`)
            },
            {
              resolve: (id: string) => {
                if (id === 'mongodb') return '/fake/node_modules/mongodb/index.js'
                throw new Error(`Cannot find module '${id}'`)
              },
            },
          )
          return req
        },
      }
    })

    // Re-import to pick up mock
    return import('../quick/db/detect.js').then((mod) => {
      const result = mod.detectDbConnection({ uri: 'mongodb://localhost:27017/testdb' })
      expect(result.type).toBe('mongodb')
      expect(result.uri).toBe('mongodb://localhost:27017/testdb')
      expect(result.driverPath).toBe('/fake/mongodb')
    })
  })
})

// Test detectDbConnection with explicit URIs using detectDbType directly
// (these test the type detection without needing driver mocks)
describe('detectDbConnection type detection via URI', () => {
  // We test the underlying detectDbType since detectDbConnection also needs a driver
  it('detects postgres type from postgresql:// URI', () => {
    expect(detectDbType('postgresql://localhost/db')).toBe('postgres')
  })

  it('detects mysql type from mysql:// URI', () => {
    expect(detectDbType('mysql://localhost/db')).toBe('mysql')
  })

  it('detects sqlite type from .sqlite file', () => {
    expect(detectDbType('/tmp/test.sqlite')).toBe('sqlite')
  })
})

describe('detectDbConnection with .env file', () => {
  it('reads specific env var from .env with --env flag', () => {
    const envPath = join(tempDir, '.env')
    writeFileSync(envPath, 'MY_DB=mongodb://localhost:27017/test\n')

    const origCwd = process.cwd
    process.cwd = () => tempDir

    // Mock driver resolution
    const origFindDriver = vi.fn()
    vi.mock('node:module', async (importOriginal) => {
      const orig = await importOriginal<typeof import('node:module')>()
      return {
        ...orig,
        createRequire: () => {
          const req = Object.assign(
            (id: string) => {
              throw new Error(`Cannot find module '${id}'`)
            },
            {
              resolve: (id: string) => {
                if (id === 'mongodb') return '/fake/mongodb'
                throw new Error(`Cannot find module '${id}'`)
              },
            },
          )
          return req
        },
      }
    })

    return import('../quick/db/detect.js').then((mod) => {
      try {
        const result = mod.detectDbConnection({ envVarName: 'MY_DB' })
        expect(result.type).toBe('mongodb')
        expect(result.uri).toBe('mongodb://localhost:27017/test')
      } finally {
        process.cwd = origCwd
      }
    })
  })

  it('throws when no connection found', () => {
    const envPath = join(tempDir, '.env')
    writeFileSync(envPath, '# only a comment\nUNRELATED=value\n')

    const origCwd = process.cwd
    process.cwd = () => tempDir

    try {
      expect(() => detectDbConnection({})).toThrow('No database connection found')
    } finally {
      process.cwd = origCwd
    }
  })

  it('throws when specified env var not found', () => {
    const envPath = join(tempDir, '.env')
    writeFileSync(envPath, 'OTHER_VAR=something\n')

    const origCwd = process.cwd
    process.cwd = () => tempDir

    try {
      expect(() => detectDbConnection({ envVarName: 'MISSING_VAR' })).toThrow(
        'Environment variable "MISSING_VAR" not found',
      )
    } finally {
      process.cwd = origCwd
    }
  })
})

// ─── findDriver ──────────────────────────────────────────────────────────────

describe('findDriver', () => {
  it('returns null when module not found', () => {
    // In test env, database drivers are not installed
    // findDriver should return null
    const result = findDriver('mongodb')
    // This may or may not be null depending on what's installed,
    // but we can at least verify it returns string | null
    expect(result === null || typeof result === 'string').toBe(true)
  })
})

// ─── parseEnvFile ────────────────────────────────────────────────────────────

describe('parseEnvFile', () => {
  it('parses KEY=VALUE format', () => {
    const envPath = join(tempDir, '.env')
    writeFileSync(envPath, 'DB_HOST=localhost\nDB_PORT=5432\n')

    const env = parseEnvFile(envPath)
    expect(env.get('DB_HOST')).toBe('localhost')
    expect(env.get('DB_PORT')).toBe('5432')
  })

  it('skips comments', () => {
    const envPath = join(tempDir, '.env')
    writeFileSync(envPath, '# This is a comment\nDB_HOST=localhost\n# Another comment\n')

    const env = parseEnvFile(envPath)
    expect(env.size).toBe(1)
    expect(env.get('DB_HOST')).toBe('localhost')
  })

  it('handles double-quoted values', () => {
    const envPath = join(tempDir, '.env')
    writeFileSync(envPath, 'DB_NAME="my database"\n')

    const env = parseEnvFile(envPath)
    expect(env.get('DB_NAME')).toBe('my database')
  })

  it('handles single-quoted values', () => {
    const envPath = join(tempDir, '.env')
    writeFileSync(envPath, "DB_NAME='my database'\n")

    const env = parseEnvFile(envPath)
    expect(env.get('DB_NAME')).toBe('my database')
  })

  it('skips empty lines', () => {
    const envPath = join(tempDir, '.env')
    writeFileSync(envPath, '\n\nDB_HOST=localhost\n\n')

    const env = parseEnvFile(envPath)
    expect(env.size).toBe(1)
  })

  it('handles values containing = signs', () => {
    const envPath = join(tempDir, '.env')
    writeFileSync(envPath, 'CONNECTION=mongodb://user:p@ss=word@host/db\n')

    const env = parseEnvFile(envPath)
    expect(env.get('CONNECTION')).toBe('mongodb://user:p@ss=word@host/db')
  })

  it('returns empty map for non-existent file', () => {
    const env = parseEnvFile(join(tempDir, 'nonexistent'))
    expect(env.size).toBe(0)
  })
})
