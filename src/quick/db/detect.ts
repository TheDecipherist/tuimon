import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

// ─── Types ───────────────────────────────────────────────────────────────────

export type DbType = 'mongodb' | 'postgres' | 'mysql' | 'sqlite'

export interface DbConnection {
  type: DbType
  uri: string
  driverPath: string
}

// ─── Known env var names per database type ───────────────────────────────────

const MONGO_VARS = ['MONGODB_URI', 'MONGO_URI', 'MONGO_URL', 'MONGODB_URL']
const PG_VARS = ['DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_URI', 'PG_URI', 'PG_URL']
const MYSQL_VARS = ['MYSQL_URL', 'MYSQL_URI', 'DB_URL', 'DB_URI']
const GENERIC_VARS = ['DB_CONNECTION', 'DB_CONNECTION_STRING']

const ALL_KNOWN_VARS = [...MONGO_VARS, ...PG_VARS, ...MYSQL_VARS, ...GENERIC_VARS]

// ─── .env parsing ────────────────────────────────────────────────────────────

export function parseEnvFile(filePath: string): Map<string, string> {
  const result = new Map<string, string>()
  let content: string
  try {
    content = readFileSync(filePath, 'utf-8')
  } catch {
    return result
  }

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue

    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue

    const key = trimmed.slice(0, eqIndex).trim()
    let value = trimmed.slice(eqIndex + 1).trim()

    // Strip surrounding quotes (single or double)
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    result.set(key, value)
  }

  return result
}

// ─── Type detection from URI ─────────────────────────────────────────────────

export function detectDbType(uri: string): DbType {
  if (uri.startsWith('mongodb://') || uri.startsWith('mongodb+srv://')) {
    return 'mongodb'
  }
  if (uri.startsWith('postgresql://') || uri.startsWith('postgres://')) {
    return 'postgres'
  }
  if (uri.startsWith('mysql://')) {
    return 'mysql'
  }
  if (uri.endsWith('.sqlite') || uri.endsWith('.sqlite3') || uri.endsWith('.db')) {
    return 'sqlite'
  }
  throw new Error(`Cannot detect database type from URI: ${uri}`)
}

// ─── Driver resolution ───────────────────────────────────────────────────────

const DRIVER_MAP: Record<DbType, string[]> = {
  mongodb: ['mongodb'],
  postgres: ['pg'],
  mysql: ['mysql2'],
  sqlite: ['better-sqlite3', 'sqlite3'],
}

export function findDriver(type: DbType): string | null {
  const candidates = DRIVER_MAP[type]
  const require = createRequire(join(process.cwd(), 'package.json'))

  for (const mod of candidates) {
    try {
      return require.resolve(mod)
    } catch {
      // Module not found, try next
    }
  }

  return null
}

// ─── Main detection ──────────────────────────────────────────────────────────

export function detectDbConnection(opts: {
  uri?: string | undefined
  envVarName?: string | undefined
  configEnvVar?: string | null
  configUri?: string | null
}): DbConnection {
  // 1. Explicit URI
  if (opts.uri) {
    return buildConnection(opts.uri)
  }

  const envPath = join(process.cwd(), '.env')

  // 2. Specific env var name from --env flag
  if (opts.envVarName) {
    const env = parseEnvFile(envPath)
    const value = env.get(opts.envVarName)
    if (value) {
      return buildConnection(value)
    }
    throw new Error(
      `Environment variable "${opts.envVarName}" not found in .env file at ${envPath}`,
    )
  }

  // 3. Config-specified env var
  if (opts.configEnvVar) {
    const env = parseEnvFile(envPath)
    const value = env.get(opts.configEnvVar)
    if (value) {
      return buildConnection(value)
    }
    throw new Error(
      `Config environment variable "${opts.configEnvVar}" not found in .env file at ${envPath}`,
    )
  }

  // 4. Config-specified URI
  if (opts.configUri) {
    return buildConnection(opts.configUri)
  }

  // 5. Auto-scan .env for known variable names
  const env = parseEnvFile(envPath)
  for (const varName of ALL_KNOWN_VARS) {
    const value = env.get(varName)
    if (value) {
      return buildConnection(value)
    }
  }

  // 6. Nothing found
  throw new Error(
    [
      'No database connection found. Tried:',
      '  - No --uri flag provided',
      '  - No --env flag provided',
      '  - No database config in tuimon config',
      `  - Auto-scanned .env for: ${ALL_KNOWN_VARS.join(', ')}`,
      '',
      'Provide a connection string with --uri or set one of the above variables in .env',
    ].join('\n'),
  )
}

function buildConnection(uri: string): DbConnection {
  const type = detectDbType(uri)
  const driverPath = findDriver(type)
  if (!driverPath) {
    const pkgName = DRIVER_MAP[type].join(' or ')
    throw new Error(
      `Database driver not found. Install the driver:\n  npm install ${pkgName}`,
    )
  }
  return { type, uri, driverPath }
}
