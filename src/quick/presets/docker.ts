import { execSync, spawn } from 'node:child_process'
import type { LayoutConfig } from '../../layout/types.js'
import type { PresetResult } from './types.js'

interface DockerStatsEntry {
  Name: string
  CPUPerc: string
  MemPerc: string
  MemUsage: string
  NetIO: string
  BlockIO: string
  PIDs: string
}

interface DockerPsEntry {
  Names: string
  State: string
  Status: string
}

function parsePercent(value: string): number {
  return parseFloat(value.replace('%', '')) || 0
}

function parseMemToMB(memStr: string): number {
  // "25.82MiB", "1.23GiB", "500KiB", "78.13MiB / 31.27GiB"
  const used = memStr.split('/')[0]?.trim() ?? memStr
  const match = used.match(/([\d.]+)\s*(KiB|MiB|GiB|B|KB|MB|GB)/i)
  if (!match) return 0
  const val = parseFloat(match[1] ?? '0')
  const unit = (match[2] ?? '').toLowerCase()
  if (unit === 'gib' || unit === 'gb') return Math.round(val * 1024)
  if (unit === 'mib' || unit === 'mb') return Math.round(val)
  if (unit === 'kib' || unit === 'kb') return Math.round(val / 1024)
  return 0
}

export function dockerPreset(): PresetResult {
  // Verify docker is available
  try {
    execSync('docker --version', { encoding: 'utf-8', stdio: 'pipe' })
  } catch {
    throw new Error('[tuimon] Docker not found. Make sure Docker is installed and running.')
  }

  // Cache for latest stats from streaming docker stats
  let latestStats: DockerStatsEntry[] = []
  let statsReady = false

  // Spawn streaming docker stats process
  const statsProc = spawn('docker', [
    'stats', '--format', '{{json .}}',
  ], { stdio: ['ignore', 'pipe', 'ignore'] })

  // Strip ANSI escape sequences from docker stats output
  function stripAnsi(s: string): string {
    return s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/\x1b\[?[0-9;]*[A-Za-z]/g, '')
  }

  let lineBuf = ''
  let currentBatch: DockerStatsEntry[] = []

  statsProc.stdout.on('data', (chunk: Buffer) => {
    lineBuf += stripAnsi(chunk.toString())
    const lines = lineBuf.split('\n')
    // Keep last potentially incomplete line
    lineBuf = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      // Try to parse each line as JSON
      try {
        const entry = JSON.parse(trimmed) as DockerStatsEntry
        currentBatch.push(entry)
        // Docker stats outputs one line per container then repeats.
        // We detect a new batch when we see a Name we already have in the current batch.
        const names = currentBatch.map((e) => e.Name)
        const hasDuplicate = names.length !== new Set(names).size
        if (hasDuplicate) {
          // The last entry is the start of a new batch - save everything before it
          latestStats = currentBatch.slice(0, -1)
          currentBatch = [entry]
          statsReady = true
        }
      } catch {
        // Not JSON, skip
      }
    }
  })

  // Clean up on exit
  process.once('beforeExit', () => { statsProc.kill() })
  process.once('SIGINT', () => { statsProc.kill() })
  process.once('SIGTERM', () => { statsProc.kill() })

  const layout: LayoutConfig = {
    title: 'Docker',
    stats: [
      { id: 'containers', label: 'Containers', type: 'stat' },
      { id: 'running', label: 'Running', type: 'stat' },
      { id: 'totalCpu', label: 'Total CPU %', type: 'stat' },
      { id: 'totalMem', label: 'Total Memory', type: 'stat' },
    ],
    panels: [
      { id: 'cpuHistory', label: 'CPU % per Container', type: 'line', span: 2 },
      { id: 'health', label: 'Container Status', type: 'status-grid' },
      { id: 'memUsage', label: 'Memory Usage', type: 'bar' },
      { id: 'containerTable', label: 'Container Details', type: 'table', span: 2 },
    ],
  }

  const data = (): Record<string, unknown> => {
    // Get container list (fast, ~50ms)
    let psEntries: DockerPsEntry[] = []
    try {
      const psOutput = execSync("docker ps --format '{{json .}}'", {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      psEntries = psOutput
        .trim()
        .split('\n')
        .filter((l) => l.trim())
        .map((l) => JSON.parse(l) as DockerPsEntry)
    } catch {
      // use empty if docker ps fails
    }

    const statsEntries = latestStats
    const totalContainers = psEntries.length
    const runningCount = psEntries.filter((c) => c.State === 'running').length

    const totalCpu = statsEntries.reduce((sum, e) => sum + parsePercent(e.CPUPerc), 0)
    const totalMemMB = statsEntries.reduce((sum, e) => sum + parseMemToMB(e.MemUsage), 0)

    const cpuHistory: Record<string, number> = {}
    const memUsage: Record<string, number> = {}
    for (const entry of statsEntries) {
      cpuHistory[entry.Name] = parsePercent(entry.CPUPerc)
      memUsage[entry.Name] = parseMemToMB(entry.MemUsage)
    }

    const health = psEntries.map((c) => ({
      label: c.Names,
      status: c.State === 'running' ? 'ok' as const : c.State === 'exited' ? 'error' as const : 'warn' as const,
    }))

    // Full container details table
    const containerTable = {
      columns: ['Name', 'CPU %', 'Memory', 'Mem %', 'Net I/O', 'Block I/O', 'PIDs'],
      rows: statsEntries.map((e) => ({
        'Name': e.Name,
        'CPU %': e.CPUPerc,
        'Memory': e.MemUsage.split('/')[0]?.trim() ?? '',
        'Mem %': e.MemPerc,
        'Net I/O': e.NetIO,
        'Block I/O': e.BlockIO,
        'PIDs': e.PIDs,
      })),
    }

    return {
      containers: totalContainers,
      running: runningCount,
      totalCpu: { value: totalCpu.toFixed(2) + '%', trend: statsEntries.length > 0 ? `${statsEntries.length} containers` : '' },
      totalMem: { value: totalMemMB > 1024 ? (totalMemMB / 1024).toFixed(1) + ' GB' : totalMemMB + ' MB' },
      cpuHistory,
      health,
      memUsage,
      containerTable,
    }
  }

  return { layout, data, refresh: 1000 }
}
