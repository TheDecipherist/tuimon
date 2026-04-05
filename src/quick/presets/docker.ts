import { execSync } from 'node:child_process'
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

function execCommand(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout: 10_000 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('ENOENT') || msg.includes('not found') || msg.includes('command not found')) {
      throw new Error('[tuimon] Docker not found. Make sure Docker is installed and running.')
    }
    throw err
  }
}

function parseJsonLines<T>(output: string): T[] {
  return output
    .trim()
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as T)
}

export function dockerPreset(): PresetResult {
  // Verify docker is available on init
  try {
    execSync('docker --version', { encoding: 'utf-8', stdio: 'pipe' })
  } catch {
    throw new Error('[tuimon] Docker not found. Make sure Docker is installed and running.')
  }

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
    const statsOutput = execCommand("docker stats --no-stream --format '{{json .}}'")
    const statsEntries = parseJsonLines<DockerStatsEntry>(statsOutput)

    const psOutput = execCommand("docker ps --format '{{json .}}'")
    const psEntries = parseJsonLines<DockerPsEntry>(psOutput)

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

    let events: Array<{ text: string; type: 'info' | 'warning' | 'error' }> = []
    try {
      const eventsOutput = execCommand("docker events --since 60s --until 0s --format '{{json .}}'")
      const lines = eventsOutput
        .trim()
        .split('\n')
        .filter((line) => line.trim() !== '')
      events = lines.map((line) => {
        const parsed = JSON.parse(line) as { Action?: string; Actor?: { Attributes?: { name?: string } } }
        const name = parsed.Actor?.Attributes?.name ?? 'unknown'
        const action = parsed.Action ?? 'unknown'
        return { text: `${name}: ${action}`, type: 'info' as const }
      })
    } catch {
      events = []
    }

    return {
      containers: totalContainers,
      running: runningCount,
      totalCpu: Math.round(totalCpu * 100) / 100,
      totalMem: Math.round(totalMem * 100) / 100,
      cpuHistory,
      health,
      memUsage,
      events,
    }
  }

  return { layout, data, refresh: 1000 }
}
