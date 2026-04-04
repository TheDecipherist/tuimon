import tuimon from 'tuimon'
import { cpus, freemem, totalmem, loadavg } from 'node:os'

interface DashboardData {
  cpu: number
  memory: number
  memoryUsedMb: number
  memoryTotalMb: number
  requests: number
  errors: number
  uptime: number
  loadAvg: number[]
  coreCount: number
  timestamp: number
  logs: string[]
}

const logs: string[] = []

function getCpuPercent(): number {
  const list = cpus()
  const total = list.reduce((a, c) => a + Object.values(c.times).reduce((x, y) => x + y, 0), 0)
  const idle = list.reduce((a, c) => a + c.times.idle, 0)
  return Math.round(100 - (idle / total) * 100)
}

async function getData(): Promise<DashboardData> {
  const cpu = getCpuPercent()
  const free = freemem()
  const total = totalmem()
  const requests = Math.round(100 + Math.random() * 400)

  if (Math.random() > 0.85) {
    logs.unshift(`[${new Date().toISOString()}] spike: ${requests} req/s`)
    if (logs.length > 5) logs.pop()
  }

  return {
    cpu,
    memory: Math.round(((total - free) / total) * 100),
    memoryUsedMb: Math.round((total - free) / 1024 / 1024),
    memoryTotalMb: Math.round(total / 1024 / 1024),
    requests,
    errors: Math.round(Math.random() * 3),
    uptime: Math.round(process.uptime()),
    loadAvg: loadavg(),
    coreCount: cpus().length,
    timestamp: Date.now(),
    logs,
  }
}

const dash = await tuimon.start({
  pages: {
    overview: {
      html: new URL('./pages/overview.html', import.meta.url).pathname,
      default: true,
      label: 'Overview',
      keys: {
        F5: { label: 'Refresh', action: async () => dash.render(await getData()) },
        F10: { label: 'Quit', action: () => process.exit(0) },
      },
    },
    cpu: {
      html: new URL('./pages/cpu-detail.html', import.meta.url).pathname,
      shortcut: 'g',
      label: 'CPU Detail',
      keys: {
        F1: { label: 'Export CSV', action: () => console.error('export not implemented') },
        F5: { label: 'Refresh', action: async () => dash.render(await getData()) },
        F10: { label: 'Quit', action: () => process.exit(0) },
      },
    },
    memory: {
      html: new URL('./pages/memory-detail.html', import.meta.url).pathname,
      shortcut: 'm',
      label: 'Memory',
      keys: {
        F5: { label: 'Refresh', action: async () => dash.render(await getData()) },
        F10: { label: 'Quit', action: () => process.exit(0) },
      },
    },
  },

  refresh: 1000,
  data: getData,
})
