import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import type { LayoutConfig } from '../../layout/types.js'
import type { PresetResult } from './types.js'

interface ProcessEntry {
  user: string
  pid: string
  cpu: number
  mem: number
  vsz: number
  rss: number
  stat: string
  command: string
}

function execCommand(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout: 5000 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('ENOENT') || msg.includes('not found') || msg.includes('command not found')) {
      throw new Error('[tuimon] ps command not found. This preset requires a Unix-like system (Linux/macOS). Windows is not supported.')
    }
    throw err
  }
}

function readFile(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf-8')
  } catch {
    return undefined
  }
}

function parseLoadAvg(): string | undefined {
  const content = readFile('/proc/loadavg')
  if (content === undefined) return undefined
  const parts = content.trim().split(/\s+/)
  const one = parts[0]
  const five = parts[1]
  const fifteen = parts[2]
  if (one === undefined || five === undefined || fifteen === undefined) return undefined
  return `${one} / ${five} / ${fifteen}`
}

function parseMemPercent(): number | undefined {
  const content = readFile('/proc/meminfo')
  if (content === undefined) return undefined
  const totalMatch = content.match(/MemTotal:\s+(\d+)/)
  const availMatch = content.match(/MemAvailable:\s+(\d+)/)
  if (totalMatch === null || availMatch === null) return undefined
  const total = parseInt(totalMatch[1] ?? '0', 10)
  const avail = parseInt(availMatch[1] ?? '0', 10)
  if (total === 0) return undefined
  return Math.round(((total - avail) / total) * 10000) / 100
}

function parsePsOutput(output: string): ProcessEntry[] {
  const lines = output.trim().split('\n')
  // Skip header line
  const entries: ProcessEntry[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (line === undefined || line.trim() === '') continue
    const parts = line.trim().split(/\s+/)
    // ps aux columns: USER PID %CPU %MEM VSZ RSS TTY STAT START TIME COMMAND
    const user = parts[0]
    const pid = parts[1]
    const cpuStr = parts[2]
    const memStr = parts[3]
    const vszStr = parts[4]
    const rssStr = parts[5]
    const statStr = parts[7]
    if (user === undefined || pid === undefined || cpuStr === undefined || memStr === undefined) continue
    const command = parts.slice(10).join(' ') || parts.slice(4).join(' ')
    entries.push({
      user,
      pid,
      cpu: parseFloat(cpuStr) || 0,
      mem: parseFloat(memStr) || 0,
      vsz: parseInt(vszStr ?? '0', 10),
      rss: parseInt(rssStr ?? '0', 10),
      stat: statStr ?? '',
      command,
    })
  }
  return entries
}

function getLoadAvgFallback(): string {
  try {
    const output = execCommand('uptime')
    const match = output.match(/load averages?:\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/)
    if (match !== null) {
      return `${match[1] ?? '?'} / ${match[2] ?? '?'} / ${match[3] ?? '?'}`
    }
  } catch {
    // ignore
  }
  return '? / ? / ?'
}

export function psPreset(): PresetResult {
  // Verify ps is available
  if (process.platform === 'win32') {
    throw new Error('[tuimon] ps preset requires a Unix-like system (Linux/macOS). Windows is not supported. Consider using PowerShell\'s Get-Process instead.')
  }

  try {
    execSync('ps --version 2>&1 || ps aux > /dev/null 2>&1', { encoding: 'utf-8', stdio: 'pipe', timeout: 5000 })
  } catch {
    throw new Error('[tuimon] ps command not available on this system.')
  }

  const layout: LayoutConfig = {
    title: 'Processes',
    stats: [
      { id: 'total', label: 'Total Processes', type: 'stat' },
      { id: 'cpuUsage', label: 'CPU Usage', type: 'gauge' },
      { id: 'memUsage', label: 'Memory Usage', type: 'gauge' },
      { id: 'loadAvg', label: 'Load Average', type: 'stat' },
    ],
    panels: [
      { id: 'cpuHistory', label: 'CPU History', type: 'line', span: 2 },
      { id: 'topCpu', label: 'Top CPU Processes', type: 'event-log' },
      { id: 'topMem', label: 'Top Memory Processes', type: 'event-log' },
      { id: 'processList', label: 'Process List', type: 'table', span: 2, throttle: 2000 },
    ],
  }

  const data = (): Record<string, unknown> => {
    const psOutput = execCommand('ps aux --sort=-%cpu | head -11')
    const processes = parsePsOutput(psOutput)
    const top10 = processes.slice(0, 10)

    // Total process count
    const countOutput = execCommand('ps aux')
    const totalLines = countOutput.trim().split('\n')
    const total = Math.max(0, totalLines.length - 1) // subtract header

    // CPU usage: sum of top processes, capped at 100
    const cpuSum = top10.reduce((sum, p) => sum + p.cpu, 0)
    const cpuUsage = Math.min(100, Math.round(cpuSum * 100) / 100)

    // Memory usage: try /proc/meminfo first, fallback to process sum
    const procMem = parseMemPercent()
    const memUsage = procMem !== undefined
      ? procMem
      : Math.min(100, Math.round(top10.reduce((sum, p) => sum + p.mem, 0) * 100) / 100)

    // Load average: try /proc/loadavg first, fallback to uptime
    const loadAvg = parseLoadAvg() ?? getLoadAvgFallback()

    // CPU history — single data point per refresh, line chart accumulates
    const cpuHistory: Record<string, number> = { CPU: cpuUsage }

    // Top CPU as event-log with percentage
    const topCpu = top10.map((p) => {
      const name = p.command.split('/').pop()?.split(' ')[0] ?? p.command
      return { text: `${name} (${p.cpu}%)`, type: 'info' as const, time: `${p.cpu}%` }
    })

    // Top Memory as event-log
    const byMem = [...processes].sort((a, b) => b.mem - a.mem).slice(0, 10)
    const topMem = byMem.map((p) => {
      const name = p.command.split('/').pop()?.split(' ')[0] ?? p.command
      return { text: `${name} (${p.mem}%)`, type: 'info' as const, time: `${p.mem}%` }
    })

    // Process list as table
    const processList = {
      columns: ['PID', 'User', 'CPU %', 'Mem %', 'Command'],
      rows: top10.map((p) => ({
        'PID': p.pid,
        'User': p.user,
        'CPU %': p.cpu,
        'Mem %': p.mem,
        'Command': (p.command.split('/').pop()?.split(' ')[0] ?? p.command).slice(0, 40),
      })),
    }

    return {
      total,
      cpuUsage,
      memUsage,
      loadAvg,
      cpuHistory,
      topCpu,
      topMem,
      processList,
    }
  }

  return { layout, data, refresh: 1000 }
}

// ─── Full ps preset with process table page ──────────────────────────────────

export async function startPsPreset(): Promise<void> {
  const preset = psPreset()
  const initialData = await Promise.resolve(preset.data())

  const tuimon = (await import('../../index.js')).default

  // Full process table data (more rows, more columns)
  function getFullProcessTable(): Record<string, unknown> {
    const psOutput = execCommand('ps aux --sort=-%cpu | head -51')
    const processes = parsePsOutput(psOutput)
    return {
      _processTable: {
        columns: ['PID', 'User', 'CPU %', 'Mem %', 'VSZ (MB)', 'RSS (MB)', 'State', 'Command'],
        rows: processes.map((p) => ({
          'PID': p.pid,
          'User': p.user,
          'CPU %': p.cpu,
          'Mem %': p.mem,
          'VSZ (MB)': Math.round(p.vsz / 1024),
          'RSS (MB)': Math.round(p.rss / 1024),
          'State': p.stat,
          'Command': p.command.slice(0, 80),
        })),
      },
    }
  }

  const tableLayout: import('../../layout/types.js').LayoutConfig = {
    title: 'All Processes',
    panels: [
      { id: '_processTable', label: 'Process List', type: 'table' as import('../../layout/types.js').WidgetConfig['type'], span: 2 },
    ],
  }

  const dash = await tuimon.start({
    pages: {
      overview: {
        html: '',
        default: true,
        label: 'Overview',
        layout: preset.layout,
        keys: {
          F5: { label: 'Refresh', action: async () => { await dash.render({ ...await Promise.resolve(preset.data()), ...getFullProcessTable() }) } },
          F3: { label: 'All Processes [P]', action: () => {} },
          F10: { label: 'Quit', action: () => { process.exit(0) } },
        },
      },
      procs: {
        html: '',
        shortcut: 'p',
        label: 'Processes',
        layout: tableLayout,
        keys: {
          F5: { label: 'Refresh', action: async () => { await dash.render({ ...await Promise.resolve(preset.data()), ...getFullProcessTable() }) } },
          F10: { label: 'Quit', action: () => { process.exit(0) } },
        },
      },
    },
    refresh: preset.refresh,
    data: async () => ({ ...await Promise.resolve(preset.data()), ...getFullProcessTable() }),
    renderDelay: 0,
  })

  await dash.render({ ...initialData, ...getFullProcessTable() })
}
