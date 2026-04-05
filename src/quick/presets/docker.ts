import { execSync, spawn } from 'node:child_process'
import type { LayoutConfig } from '../../layout/types.js'
import type { PresetResult } from './types.js'

interface DockerStatsEntry {
  Name: string
  CPUPerc: string
  MemPerc: string
  MemUsage: string
}

interface DockerPsEntry {
  Names: string
  State: string
  Status: string
}

function parsePercent(value: string): number {
  return parseFloat(value.replace('%', '')) || 0
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
      { id: 'totalCpu', label: 'CPU Usage', type: 'gauge' },
      { id: 'totalMem', label: 'Memory', type: 'gauge' },
    ],
    panels: [
      { id: 'cpuHistory', label: 'CPU per Container', type: 'line', span: 2 },
      { id: 'health', label: 'Container Status', type: 'status-grid' },
      { id: 'memUsage', label: 'Memory per Container', type: 'bar' },
      { id: 'events', label: 'Recent Events', type: 'event-log', throttle: 3000 },
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
    const totalMem =
      statsEntries.length > 0
        ? statsEntries.reduce((sum, e) => sum + parsePercent(e.MemPerc), 0) / statsEntries.length
        : 0

    const cpuHistory: Record<string, number> = {}
    for (const entry of statsEntries) {
      cpuHistory[entry.Name] = parsePercent(entry.CPUPerc)
    }

    const health = psEntries.map((c) => ({
      label: c.Names,
      status: c.State === 'running' ? 'ok' as const : c.State === 'exited' ? 'error' as const : 'warn' as const,
    }))

    const memUsage: Record<string, number> = {}
    for (const entry of statsEntries) {
      memUsage[entry.Name] = parsePercent(entry.MemPerc)
    }

    return {
      containers: totalContainers,
      running: runningCount,
      totalCpu: Math.round(totalCpu * 100) / 100,
      totalMem: Math.round(totalMem * 100) / 100,
      cpuHistory,
      health,
      memUsage,
      events: statsReady ? [] : [{ text: 'Waiting for docker stats...', type: 'info' as const }],
    }
  }

  return { layout, data, refresh: 1000 }
}
