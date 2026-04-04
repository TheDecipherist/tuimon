import path from 'node:path'
import { mkdirSync, writeFileSync, rmSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import type {
  TuiMonOptions,
  TuiMonDashboard,
  FKeyMap,
} from './types.js'
import { detectGraphicsSupport, getTerminalDimensions } from './detect.js'
import { startServer } from './server.js'
import { createBrowser } from './browser.js'
import { encodeAndRender } from './encoder.js'
import { startKeyHandler } from './keyhandler.js'
import { renderFKeyBar } from './fkeybar.js'
import { createRouter } from './router.js'
import { generateDashboardHtml } from './layout/generator.js'

const MAX_REFRESH_FAILURES = 5

async function start(options: TuiMonOptions): Promise<TuiMonDashboard> {
  const { pages } = options
  const renderDelay = options.renderDelay ?? 50

  // Validate pages is not empty
  const pageEntries = Object.entries(pages)
  if (pageEntries.length === 0) {
    throw new Error('[tuimon] At least one page must be defined')
  }

  // Detect terminal capabilities
  const graphics = await detectGraphicsSupport()
  const dims = await getTerminalDimensions()

  if (!graphics.protocol) {
    console.error('[tuimon] No supported graphics protocol detected. Falling back to kitty.')
  }

  // iterm2 uses kitty-compatible rendering for our purposes
  const protocol: 'kitty' | 'sixel' = (graphics.protocol === 'sixel') ? 'sixel' : 'kitty'

  // Clean up stale temp dirs from previous crashed runs
  try {
    const tmp = tmpdir()
    for (const entry of readdirSync(tmp)) {
      if (entry.startsWith('tuimon-layout-')) {
        const pid = entry.split('-').pop()
        // Check if process is still running — if not, it's orphaned
        try { if (pid) process.kill(Number(pid), 0) } catch {
          try { rmSync(path.join(tmp, entry), { recursive: true, force: true }) } catch {}
        }
      }
    }
  } catch {}

  // Generate HTML for layout-based pages
  const layoutTmpDir = path.join(tmpdir(), `tuimon-layout-${process.pid}`)
  let layoutTmpCreated = false

  for (const [id, page] of pageEntries) {
    if (page.layout && !page.html) {
      if (!layoutTmpCreated) {
        mkdirSync(layoutTmpDir, { recursive: true })
        layoutTmpCreated = true
      }
      const html = generateDashboardHtml(page.layout)
      const htmlPath = path.join(layoutTmpDir, `${id}.html`)
      writeFileSync(htmlPath, html, 'utf-8')
      page.html = htmlPath
    }
  }

  // Resolve all page html paths and find common root
  const resolvedPages = new Map<string, string>()
  const allDirs: string[] = []

  for (const [id, page] of pageEntries) {
    const resolved = path.resolve(process.cwd(), page.html)
    resolvedPages.set(id, resolved)
    allDirs.push(path.dirname(resolved))
  }

  // Find common parent directory
  let rootDir = allDirs[0] ?? process.cwd()
  if (allDirs.length > 1) {
    const parts = rootDir.split(path.sep)
    for (const dir of allDirs) {
      const dirParts = dir.split(path.sep)
      let common = 0
      while (common < parts.length && common < dirParts.length && parts[common] === dirParts[common]) {
        common++
      }
      parts.length = common
    }
    rootDir = parts.join(path.sep) || '/'
  }

  // Start server
  const server = await startServer({ rootDir })

  // Calculate viewport dimensions (reserve 1 row for F-key bar)
  const cellPixelHeight = Math.floor(dims.pixelHeight / dims.rows)
  const viewportHeight = dims.pixelHeight - cellPixelHeight
  const viewportWidth = dims.pixelWidth

  // Resolve default page URL for initial navigation
  const defaultPageId = pageEntries.find(([, p]) => p.default)?.[0] ?? pageEntries[0]![0]
  const defaultPage = pages[defaultPageId]!
  const defaultFilename = path.basename(path.resolve(process.cwd(), defaultPage.html))
  const defaultPageUrl = server.urlFor(defaultFilename)

  // Start browser — navigate directly to the default page
  const browser = await createBrowser({
    url: defaultPageUrl,
    width: viewportWidth,
    height: viewportHeight,
  })

  // Enter alt screen + hide cursor
  process.stdout.write('\x1b[?1049h\x1b[?25l')

  // Track last data for re-rendering after navigation
  let lastData: Record<string, unknown> = {}
  let refreshInterval: ReturnType<typeof setInterval> | undefined
  let stopped = false
  let rendering = false

  // Handle terminal resize — pause rendering during resize, redraw when settled
  const cellPixelWidth = Math.floor(dims.pixelWidth / dims.cols)
  let resizing = false
  let resizeTimer: ReturnType<typeof setTimeout> | undefined
  const onTermResize = (): void => {
    if (stopped) return
    resizing = true // pause frame rendering
    if (resizeTimer) clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
      const cols = process.stdout.columns || 80
      const rows = process.stdout.rows || 24
      const newW = Math.max(320, cols * cellPixelWidth)
      const newH = Math.max(200, (rows - 1) * cellPixelHeight)
      process.stdout.write('\x1b[2J\x1b[H')
      browser.resize(newW, newH)
        .then(() => {
          resizing = false
          return renderFrame()
        })
        .then(() => { fkeyBar.redraw() })
        .catch((err) => {
          resizing = false
          console.error('[tuimon] resize error:', err)
        })
    }, 300)
  }
  process.stdout.on('resize', onTermResize)

  // Render function with concurrency guard + timeout safety
  const debug = !!process.env['TUIMON_DEBUG']
  let renderTimeout: ReturnType<typeof setTimeout> | undefined
  async function renderFrame(data?: Record<string, unknown>): Promise<void> {
    if (stopped || rendering || resizing) return
    rendering = true
    // Safety: if render takes >5s, log warning but don't force-unlock (avoids race)
    renderTimeout = setTimeout(() => {
      console.error('[tuimon] render frame exceeded 5s — possible hang')
    }, 5000)
    const t0 = performance.now()
    try {
      if (data) lastData = data

      const t1 = performance.now()
      await browser.pushData(lastData)
      const t2 = performance.now()

      await new Promise((resolve) => setTimeout(resolve, renderDelay))
      const t3 = performance.now()

      const screenshot = await browser.screenshot()
      const t4 = performance.now()

      await encodeAndRender(screenshot, { protocol })
      const t5 = performance.now()

      // Always redraw F-key bar after frame — image may have overwritten it
      fkeyBar.redraw()

      if (debug) {
        const total = (t5 - t0).toFixed(0)
        const push = (t2 - t1).toFixed(0)
        const wait = (t3 - t2).toFixed(0)
        const snap = (t4 - t3).toFixed(0)
        const encode = (t5 - t4).toFixed(0)
        const size = (screenshot.length / 1024).toFixed(0)
        process.stderr.write(
          `[tuimon] frame ${total}ms | push:${push} wait:${wait} snap:${snap} encode:${encode} | ${size}KB\n`
        )
      }
    } finally {
      if (renderTimeout) clearTimeout(renderTimeout)
      rendering = false
    }
  }

  // F-key bar
  const fkeyBar = renderFKeyBar({ keys: defaultPage.keys ?? {} })

  // Router navigate helper
  async function navigateToPage(htmlPath: string): Promise<void> {
    // Internal paths (e.g., /tuimon/confirm-quit.html) are served as-is
    // Page paths are resolved to their filename
    const url = htmlPath.startsWith('/tuimon/')
      ? `${server.url}${htmlPath}`
      : server.urlFor(path.basename(htmlPath))
    await browser.navigate(url)
  }

  // Router
  const router = createRouter({
    pages,
    navigate: navigateToPage,
    render: async () => { await renderFrame() },
    setKeys: (keys: FKeyMap) => { fkeyBar.setKeys(keys) },
    confirmQuitHtml: '/tuimon/confirm-quit.html',
  })

  // Arrow/Page key → table navigation action mapping
  const NAV_KEYS: Record<string, string> = {
    '\x1b[B': 'next',   // Arrow Down
    '\x1b[A': 'prev',   // Arrow Up
    '\x1b[6~': 'next',  // Page Down
    '\x1b[5~': 'prev',  // Page Up
    '\x1b[F': 'last',   // End
    '\x1b[H': 'first',  // Home
  }

  // Key handler — intercept Ctrl+C for emergency exit, nav keys for tables
  const keyHandler = startKeyHandler({
    onKey: (key: string) => {
      // Ctrl+C: synchronous emergency cleanup and exit
      if (key === '\x03') {
        keyHandler.stop()
        fkeyBar.stop()
        process.stdout.write('\x1b[?25h\x1b[?1049l')
        process.exit(0)
        return
      }

      // Arrow/Page keys: dispatch table navigation to browser
      const navAction = NAV_KEYS[key]
      if (navAction) {
        browser.evaluate(`window.dispatchEvent(new CustomEvent('tuimon:tableNav', { detail: { action: '${navAction}' } }))`)
          .then(() => renderFrame())
          .catch(() => {})
        return
      }

      router.handleKey(key).catch((err) => {
        console.error('[tuimon] key handler error:', err)
      })
    },
  })

  // Auto-refresh with circuit breaker
  if (options.refresh && options.data) {
    const dataFn = options.data
    let consecutiveFailures = 0
    refreshInterval = setInterval(async () => {
      try {
        const data = await dataFn()
        await renderFrame(data)
        consecutiveFailures = 0
      } catch (err) {
        consecutiveFailures++
        console.error('[tuimon] refresh error:', err)
        if (consecutiveFailures >= MAX_REFRESH_FAILURES) {
          console.error(`[tuimon] ${MAX_REFRESH_FAILURES} consecutive refresh failures — disabling auto-refresh`)
          if (refreshInterval) clearInterval(refreshInterval)
        }
      }
    }, options.refresh)
    refreshInterval.unref()
  }

  // Stop function
  async function stop(): Promise<void> {
    if (stopped) return
    stopped = true

    if (refreshInterval) clearInterval(refreshInterval)
    if (resizeTimer) clearTimeout(resizeTimer)
    process.stdout.removeListener('resize', onTermResize)
    keyHandler.stop()
    fkeyBar.stop()
    await browser.close()
    await server.close()

    // Clean up temp layout files
    if (layoutTmpCreated) {
      try { rmSync(layoutTmpDir, { recursive: true, force: true }) } catch {}
    }

    // Restore terminal: show cursor + exit alt screen
    process.stdout.write('\x1b[?25h\x1b[?1049l')
  }

  // Ensure cleanup on any exit path
  const onShutdown = () => {
    // Force exit after 3s if graceful stop hangs
    const forceTimer = setTimeout(() => { process.exit(1) }, 3000)
    forceTimer.unref()
    stop().catch(() => { process.exit(1) })
  }
  process.once('SIGINT', onShutdown)
  process.once('SIGTERM', onShutdown)
  process.once('beforeExit', () => { void stop() })

  return {
    render: async (data: Record<string, unknown>) => { await renderFrame(data) },
    stop,
  }
}

export default { start }
