#!/usr/bin/env npx tsx

import tuimon from '../src/index.js'
import { cpus, freemem, totalmem, loadavg } from 'node:os'

// ─── Fake data generators ────────────────────────────────────────────────────

const logs: string[] = []
let reqTotal = 0

function getCpuPercent(): number {
  const list = cpus()
  const total = list.reduce((a, c) => a + Object.values(c.times).reduce((x, y) => x + y, 0), 0)
  const idle = list.reduce((a, c) => a + c.times.idle, 0)
  return Math.round(100 - (idle / total) * 100)
}

function getMemPercent(): number {
  return Math.round(((totalmem() - freemem()) / totalmem()) * 100)
}

function formatUptime(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `${h}h ${m}m`
}

// ─── Start dashboard ─────────────────────────────────────────────────────────

const dash = await tuimon.start({
  pages: {
    overview: {
      html: '', // will be overridden by layout
      default: true,
      label: 'Overview',
      layout: {
        title: 'TuiMon Demo',
        stats: [
          { id: 'cpu', label: 'CPU', type: 'gauge' },
          { id: 'mem', label: 'Memory', type: 'gauge' },
          { id: 'reqs', label: 'Requests/s', type: 'stat' },
          { id: 'uptime', label: 'Uptime', type: 'stat' },
        ],
        panels: [
          { id: 'traffic', label: 'Real-Time Traffic', type: 'line', span: 2 },
          { id: 'health', label: 'Node Health', type: 'status-grid', throttle: 5000 },
          { id: 'endpoints', label: 'Endpoint Distribution', type: 'doughnut', throttle: 3000 },
          { id: 'events', label: 'Recent Events', type: 'event-log', throttle: 2000 },
          { id: 'methods', label: 'HTTP Methods', type: 'bar', throttle: 1000 },
        ],
      },
      keys: {
        F5: {
          label: 'Force Refresh',
          action: async () => { await dash.render(getData()) },
        },
        F10: {
          label: 'Quit',
          action: () => { process.exit(0) },
        },
      },
    },
  },

  refresh: 250,
  renderDelay: 0,
  data: () => getData(),
})

function getData(): Record<string, unknown> {
  const cpu = getCpuPercent()
  const mem = getMemPercent()
  const reqRate = Math.round(80 + Math.random() * 300)
  reqTotal += reqRate

  // Random events
  if (Math.random() > 0.7) {
    const events = [
      { text: 'Deploy completed successfully', type: 'success' as const },
      { text: `Request spike: ${reqRate} req/s`, type: 'warning' as const },
      { text: 'Health check passed', type: 'info' as const },
      { text: 'Cache cleared', type: 'info' as const },
      { text: 'Connection pool resized', type: 'warning' as const },
    ]
    const evt = events[Math.floor(Math.random() * events.length)]!
    logs.unshift(evt)
    if (logs.length > 15) logs.pop()
  }

  // Simulate node health
  const nodes = ['Node-1', 'Node-2', 'Node-3', 'Node-4', 'Node-5'].map((label) => {
    const r = Math.random()
    const status = r > 0.95 ? 'error' as const : r > 0.85 ? 'warn' as const : 'ok' as const
    return { label, status }
  })

  return {
    // Stats — lazy format (just numbers)
    cpu,
    mem,
    reqs: { value: reqRate, trend: reqRate > 200 ? '+' + reqRate : '', unit: 'req/s' },
    uptime: formatUptime(Math.round(process.uptime())),

    // Line chart — key:value pairs, TuiMon accumulates history
    traffic: {
      Requests: reqRate,
      Errors: Math.round(Math.random() * 8),
      Latency: Math.round(20 + Math.random() * 60),
    },

    // Status grid — detailed format
    health: nodes,

    // Doughnut — key:value pairs
    endpoints: {
      '/api/users': 340,
      '/api/posts': 220,
      '/api/auth': 180,
      '/health': 90,
      '/ws': 45,
    },

    // Event log — detailed format
    events: logs,

    // Bar chart — key:value pairs
    methods: {
      GET: Math.round(200 + Math.random() * 100),
      POST: Math.round(50 + Math.random() * 80),
      PUT: Math.round(10 + Math.random() * 30),
      DELETE: Math.round(5 + Math.random() * 15),
    },
  }
}
