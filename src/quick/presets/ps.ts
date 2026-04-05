import { execSync } from 'node:child_process'
import type { LayoutConfig } from '../../layout/types.js'
import type { PresetResult } from './types.js'

interface ProcessEntry {
  user: string
  pid: string
  cpu: number
  mem: number
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
    const { readFileSync } = require('node:fs') as typeof import('node:fs')
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
    const user = parts[0]
    const pid = parts[1]
    const cpuStr = parts[2]
    const memStr = parts[3]
    if (user === undefined || pid === undefined || cpuStr === undefined || memStr === undefined) continue
    // Command is everything from column index 10 onward
    const command = parts.slice(10).join(' ') || parts.slice(4).join(' ')
    entries.push({
      user,
      pid,
      cpu: parseFloat(cpuStr) || 0,
      mem: parseFloat(memStr) || 0,
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
      { id: 'topCpu', label: 'Top CPU Processes', type: 'bar', span: 2 },
      { id: 'topMem', label: 'Top Memory Processes', type: 'bar' },
      { id: 'cpuHistory', label: 'CPU History', type: 'line' },
      { id: 'processList', label: 'Process List', type: 'event-log', span: 2, throttle: 2000 },
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

    // Top CPU bar chart
    const topCpu: Record<string, number> = {}
    for (const p of top10) {
      const name = p.command.split('/').pop()?.split(' ')[0] ?? p.command
      const key = name || `pid:${p.pid}`
      topCpu[key] = (topCpu[key] ?? 0) + p.cpu
    }

    // Top Memory bar chart — re-sort by memory
    const byMem = [...processes].sort((a, b) => b.mem - a.mem).slice(0, 10)
    const topMem: Record<string, number> = {}
    for (const p of byMem) {
      const name = p.command.split('/').pop()?.split(' ')[0] ?? p.command
      const key = name || `pid:${p.pid}`
      topMem[key] = (topMem[key] ?? 0) + p.mem
    }

    // CPU history — single data point per refresh, line chart accumulates
    const cpuHistory: Record<string, number> = { CPU: cpuUsage }

    // Process list — event-log entries
    const processList = top10.map((p) => {
      const name = p.command.split('/').pop()?.split(' ')[0] ?? p.command
      return `${name} ${p.cpu}% CPU ${p.mem}% MEM ${p.command}`
    })

    return {
      total,
      cpuUsage,
      memUsage,
      loadAvg,
      topCpu,
      topMem,
      cpuHistory,
      processList,
    }
  }

  return { layout, data, refresh: 1000 }
}
