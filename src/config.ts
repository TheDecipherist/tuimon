import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

// ─── Config types ────────────────────────────────────────────────────────────

export interface TuiMonConfig {
  db: {
    envVar: string | null
    uri: string | null
    defaultLimit: number
    watchInterval: number
  }
  refresh: number
  renderDelay: number
}

const DEFAULT_CONFIG: TuiMonConfig = {
  db: {
    envVar: null,
    uri: null,
    defaultLimit: 100,
    watchInterval: 2000,
  },
  refresh: 500,
  renderDelay: 0,
}

// ─── Paths ───────────────────────────────────────────────────────────────────

function configDir(): string {
  return join(homedir(), '.tuimon')
}

function configPath(): string {
  return join(configDir(), 'config.json')
}

// ─── Load / Save ─────────────────────────────────────────────────────────────

export function loadConfig(): TuiMonConfig {
  const p = configPath()
  if (!existsSync(p)) return { ...DEFAULT_CONFIG, db: { ...DEFAULT_CONFIG.db } }

  try {
    const raw = JSON.parse(readFileSync(p, 'utf-8')) as Partial<TuiMonConfig>
    return {
      db: {
        envVar: raw.db?.envVar ?? DEFAULT_CONFIG.db.envVar,
        uri: raw.db?.uri ?? DEFAULT_CONFIG.db.uri,
        defaultLimit: raw.db?.defaultLimit ?? DEFAULT_CONFIG.db.defaultLimit,
        watchInterval: raw.db?.watchInterval ?? DEFAULT_CONFIG.db.watchInterval,
      },
      refresh: raw.refresh ?? DEFAULT_CONFIG.refresh,
      renderDelay: raw.renderDelay ?? DEFAULT_CONFIG.renderDelay,
    }
  } catch {
    return { ...DEFAULT_CONFIG, db: { ...DEFAULT_CONFIG.db } }
  }
}

export function saveConfig(config: TuiMonConfig): void {
  const dir = configDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(configPath(), JSON.stringify(config, null, 2) + '\n', 'utf-8')
}

export function resetConfig(): void {
  saveConfig({ ...DEFAULT_CONFIG, db: { ...DEFAULT_CONFIG.db } })
}

// ─── Get/Set by dot path ─────────────────────────────────────────────────────

export function getConfigValue(config: TuiMonConfig, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = config
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

export function setConfigValue(config: TuiMonConfig, path: string, value: string): TuiMonConfig {
  const parts = path.split('.')
  const result = JSON.parse(JSON.stringify(config)) as Record<string, unknown>

  let current = result
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!
    if (typeof current[part] !== 'object' || current[part] === null) {
      current[part] = {}
    }
    current = current[part] as Record<string, unknown>
  }

  const lastKey = parts[parts.length - 1]!

  // Auto-convert types
  if (value === 'null' || value === '') {
    current[lastKey] = null
  } else if (value === 'true') {
    current[lastKey] = true
  } else if (value === 'false') {
    current[lastKey] = false
  } else if (!isNaN(Number(value)) && value.trim() !== '') {
    current[lastKey] = Number(value)
  } else {
    current[lastKey] = value
  }

  return result as unknown as TuiMonConfig
}

// ─── Print config ────────────────────────────────────────────────────────────

export function printConfig(config: TuiMonConfig): void {
  console.log('')
  console.log('TuiMon Config (~/.tuimon/config.json)')
  console.log('\u2500'.repeat(40))
  console.log(`  db.envVar:        ${config.db.envVar ?? '(auto-detect)'}`)
  console.log(`  db.uri:           ${config.db.uri ? '****' + config.db.uri.slice(-20) : '(from .env)'}`)
  console.log(`  db.defaultLimit:  ${config.db.defaultLimit}`)
  console.log(`  db.watchInterval: ${config.db.watchInterval}ms`)
  console.log(`  refresh:          ${config.refresh}ms`)
  console.log(`  renderDelay:      ${config.renderDelay}ms`)
  console.log('')
}
