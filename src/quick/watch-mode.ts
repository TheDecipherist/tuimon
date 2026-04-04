import path from 'node:path'
import type { LayoutConfig } from '../layout/types.js'
import { autoLayout } from './auto-layout.js'
import tuimon from '../index.js'

interface ModuleExports {
  default?: () => Record<string, unknown> | Promise<Record<string, unknown>>
  refresh?: number
  title?: string
  layout?: LayoutConfig
}

export async function startWatchModule(filePath: string): Promise<void> {
  const resolved = path.resolve(process.cwd(), filePath)
  let mod: ModuleExports

  try {
    mod = await import(resolved) as ModuleExports
  } catch (err) {
    console.error(`[tuimon] Failed to import ${filePath}:`, err)
    process.exit(1)
  }

  const dataFn = mod.default ?? (typeof mod === 'function' ? mod as unknown as () => Record<string, unknown> : null)
  if (!dataFn || typeof dataFn !== 'function') {
    console.error(`[tuimon] ${filePath} must export a default function that returns data`)
    process.exit(1)
  }

  const refresh = mod.refresh ?? 1000
  const title = mod.title ?? path.basename(filePath, path.extname(filePath))

  // Get first data call to auto-detect layout
  let firstData: Record<string, unknown>
  try {
    firstData = await Promise.resolve(dataFn())
  } catch (err) {
    console.error(`[tuimon] Error calling data function:`, err)
    process.exit(1)
  }

  // Use module's layout or auto-detect from data shape
  const layout: LayoutConfig = mod.layout ?? autoDetectFromData(firstData, title)

  const dash = await tuimon.start({
    pages: {
      main: {
        html: '',
        default: true,
        layout,
        keys: {
          F5: { label: 'Refresh', action: async () => { await dash.render(await Promise.resolve(dataFn())) } },
          F10: { label: 'Quit', action: () => process.exit(0) },
        },
      },
    },
    refresh,
    data: dataFn,
    renderDelay: 0,
  })
}

export async function startWatchUrl(url: string, interval: number = 1000): Promise<void> {
  // Fetch first response to detect layout
  let firstData: Record<string, unknown>
  try {
    const res = await fetch(url)
    firstData = await res.json() as Record<string, unknown>
  } catch (err) {
    console.error(`[tuimon] Failed to fetch ${url}:`, err)
    process.exit(1)
  }

  const title = new URL(url).hostname
  const layout = autoDetectFromData(firstData, title)

  const dataFn = async (): Promise<Record<string, unknown>> => {
    const res = await fetch(url)
    return await res.json() as Record<string, unknown>
  }

  const dash = await tuimon.start({
    pages: {
      main: {
        html: '',
        default: true,
        layout,
        keys: {
          F5: { label: 'Refresh', action: async () => { await dash.render(await dataFn()) } },
          F10: { label: 'Quit', action: () => process.exit(0) },
        },
      },
    },
    refresh: interval,
    data: dataFn,
    renderDelay: 0,
  })
}

// ─── Auto-detect layout from a plain data object ────────────────────────────

function autoDetectFromData(data: Record<string, unknown>, title: string): LayoutConfig {
  const stats: LayoutConfig['stats'] = []
  const panels: LayoutConfig['panels'] = []

  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'number') {
      // 0-100 → gauge, otherwise stat
      if (value >= 0 && value <= 100 && key.match(/cpu|mem|disk|usage|percent|pct|load/i)) {
        stats.push({ id: key, label: formatLabel(key), type: 'gauge' })
      } else {
        stats.push({ id: key, label: formatLabel(key), type: 'stat' })
      }
    } else if (typeof value === 'string') {
      stats.push({ id: key, label: formatLabel(key), type: 'stat' })
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>
      // { value, trend?, unit? } → stat
      if ('value' in obj) {
        stats.push({ id: key, label: formatLabel(key), type: 'stat' })
      } else {
        // Record<string, number> → line chart (will accumulate)
        const allNumbers = Object.values(obj).every((v) => typeof v === 'number')
        if (allNumbers && Object.keys(obj).length >= 2) {
          panels.push({ id: key, label: formatLabel(key), type: 'line', span: 2 })
        } else if (allNumbers) {
          panels.push({ id: key, label: formatLabel(key), type: 'bar' })
        } else {
          panels.push({ id: key, label: formatLabel(key), type: 'doughnut' })
        }
      }
    } else if (Array.isArray(value)) {
      if (value.length === 0) continue
      const first = value[0]
      if (typeof first === 'string') {
        // Array of strings → event-log
        panels.push({ id: key, label: formatLabel(key), type: 'event-log' })
      } else if (typeof first === 'object' && first !== null) {
        if ('status' in first || 'label' in first) {
          panels.push({ id: key, label: formatLabel(key), type: 'status-grid' })
        } else if ('text' in first || 'message' in first) {
          panels.push({ id: key, label: formatLabel(key), type: 'event-log' })
        } else {
          panels.push({ id: key, label: formatLabel(key), type: 'event-log' })
        }
      }
    }
  }

  // Move excess stats (> 6) to panels as stat
  if (stats.length > 6) {
    const overflow = stats.splice(6)
    for (const s of overflow) {
      panels.unshift(s)
    }
  }

  return { title, stats, panels }
}

function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
}
