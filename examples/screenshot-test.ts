#!/usr/bin/env npx tsx

/**
 * Takes a screenshot of the default template with dummy data
 * and saves it to examples/screenshot.png — open in any image viewer.
 */

import { writeFileSync, mkdirSync, writeFileSync as wf } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { chromium } from 'playwright'
import { generateDashboardHtml } from '../src/layout/generator.js'
import type { LayoutConfig } from '../src/layout/types.js'

const layout: LayoutConfig = {
  title: 'TuiMon Demo',
  stats: [
    { id: 'cpu', label: 'CPU', type: 'gauge' },
    { id: 'mem', label: 'Memory', type: 'gauge' },
    { id: 'reqs', label: 'Requests/s', type: 'stat' },
    { id: 'uptime', label: 'Uptime', type: 'stat' },
  ],
  panels: [
    { id: 'traffic', label: 'Real-Time Traffic', type: 'line', span: 2 },
    { id: 'health', label: 'Node Health', type: 'status-grid' },
    { id: 'endpoints', label: 'Endpoint Distribution', type: 'doughnut' },
    { id: 'events', label: 'Recent Events', type: 'event-log' },
    { id: 'methods', label: 'HTTP Methods', type: 'bar' },
  ],
}

// Generate HTML
const html = generateDashboardHtml(layout)
const tmpDir = path.join(tmpdir(), `tuimon-screenshot-${Date.now()}`)
mkdirSync(tmpDir, { recursive: true })
const htmlPath = path.join(tmpDir, 'dashboard.html')
writeFileSync(htmlPath, html, 'utf-8')

console.log('Launching browser...')

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
await page.setViewportSize({ width: 1600, height: 900 })
await page.goto(`file://${htmlPath}`, { waitUntil: 'domcontentloaded' })

// Push some dummy data a few times to build chart history
for (let i = 0; i < 30; i++) {
  await page.evaluate((data: Record<string, unknown>) => {
    const win = globalThis as Record<string, unknown>
    if (typeof win['__tuimon_update__'] === 'function') {
      ;(win['__tuimon_update__'] as (d: Record<string, unknown>) => void)(data)
    }
  }, {
    cpu: 35 + Math.round(Math.random() * 40),
    mem: 55 + Math.round(Math.random() * 20),
    reqs: { value: Math.round(100 + Math.random() * 300), trend: '+12', unit: 'req/s' },
    uptime: '2h 15m',
    traffic: {
      Requests: Math.round(100 + Math.random() * 250),
      Errors: Math.round(Math.random() * 15),
      Latency: Math.round(20 + Math.random() * 60),
    },
    health: [
      { label: 'Node-1', status: 'ok' },
      { label: 'Node-2', status: 'ok' },
      { label: 'Node-3', status: Math.random() > 0.5 ? 'warn' : 'ok' },
      { label: 'Node-4', status: 'ok' },
      { label: 'Node-5', status: Math.random() > 0.8 ? 'error' : 'ok' },
    ],
    endpoints: {
      '/api/users': 340,
      '/api/posts': 220,
      '/api/auth': 180,
      '/health': 90,
      '/ws': 45,
    },
    events: [
      { text: 'Deploy completed successfully', type: 'success', time: '2:50 PM' },
      { text: 'Request spike detected: 342 req/s', type: 'warning', time: '2:48 PM' },
      { text: 'Health check passed all nodes', type: 'info', time: '2:45 PM' },
      { text: 'Cache cleared — 2.3GB freed', type: 'info', time: '2:42 PM' },
      { text: 'Connection timeout to DB replica', type: 'error', time: '2:40 PM' },
      { text: 'Auto-scaled to 5 replicas', type: 'success', time: '2:38 PM' },
    ],
    methods: {
      GET: Math.round(200 + Math.random() * 100),
      POST: Math.round(50 + Math.random() * 80),
      PUT: Math.round(10 + Math.random() * 30),
      DELETE: Math.round(5 + Math.random() * 15),
    },
  })
  await new Promise((r) => setTimeout(r, 50))
}

// Wait for charts to render
await new Promise((r) => setTimeout(r, 500))

// Take screenshot
const outPath = path.resolve('examples/screenshot.png')
const buf = await page.screenshot({ type: 'png' })
writeFileSync(outPath, buf)

await browser.close()
console.log(`Screenshot saved to: ${outPath}`)
console.log('Open it in your image viewer or VS Code to see the dashboard.')
