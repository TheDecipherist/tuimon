import path from 'node:path'
import type {
  TuiMonOptions,
  TuiMonDashboard,
  FKeyMap,
  PageState,
} from './types.js'
import { detectGraphicsSupport, getTerminalDimensions } from './detect.js'
import { startServer } from './server.js'
import { createBrowser } from './browser.js'
import { encodeAndRender } from './encoder.js'
import { startKeyHandler } from './keyhandler.js'
import { renderFKeyBar } from './fkeybar.js'
import { createRouter } from './router.js'

async function start(options: TuiMonOptions): Promise<TuiMonDashboard> {
  const { pages } = options
  const renderDelay = options.renderDelay ?? 50

  // Detect terminal capabilities
  const graphics = await detectGraphicsSupport()
  const dims = await getTerminalDimensions()

  if (!graphics.protocol) {
    console.error('[tuimon] No supported graphics protocol detected. Falling back to kitty.')
  }

  // iterm2 uses kitty-compatible rendering for our purposes
  const protocol: 'kitty' | 'sixel' = (graphics.protocol === 'sixel') ? 'sixel' : 'kitty'

  // Resolve all page html paths and find common root
  const resolvedPages = new Map<string, string>()
  const allDirs: string[] = []

  for (const [id, page] of Object.entries(pages)) {
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

  // Start browser
  const browser = await createBrowser({
    url: server.url,
    width: viewportWidth,
    height: viewportHeight,
  })

  // Enter alt screen + hide cursor
  process.stdout.write('\x1b[?1049h\x1b[?25l')

  // Track last data for re-rendering after navigation
  let lastData: Record<string, unknown> = {}
  let refreshInterval: ReturnType<typeof setInterval> | undefined
  let stopped = false

  // Render function
  async function renderFrame(data?: Record<string, unknown>): Promise<void> {
    if (stopped) return
    if (data) lastData = data
    await browser.pushData(lastData)
    await new Promise((resolve) => setTimeout(resolve, renderDelay))
    const screenshot = await browser.screenshot()
    await encodeAndRender(screenshot, { protocol })
  }

  // F-key bar
  const defaultPageId = Object.entries(pages).find(([, p]) => p.default)?.[0] ?? Object.keys(pages)[0]!
  const defaultPage = pages[defaultPageId]!
  const fkeyBar = renderFKeyBar({ keys: defaultPage.keys ?? {} })

  // Router navigate helper — uses relative paths from rootDir
  async function navigateToPage(htmlPath: string): Promise<void> {
    const filename = path.basename(htmlPath)
    const url = server.urlFor(filename)
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

  // Key handler
  const keyHandler = startKeyHandler({
    onKey: (key: string) => { void router.handleKey(key) },
  })

  // Auto-refresh
  if (options.refresh && options.data) {
    const dataFn = options.data
    refreshInterval = setInterval(async () => {
      try {
        const data = await dataFn()
        await renderFrame(data)
      } catch (err) {
        console.error('[tuimon] refresh error:', err)
      }
    }, options.refresh)
  }

  // Navigate to the default page
  const defaultHtml = defaultPage.html
  const defaultFilename = path.basename(path.resolve(process.cwd(), defaultHtml))
  await browser.navigate(server.urlFor(defaultFilename))

  // Stop function
  async function stop(): Promise<void> {
    if (stopped) return
    stopped = true

    if (refreshInterval) clearInterval(refreshInterval)
    keyHandler.stop()
    fkeyBar.stop()
    await browser.close()
    await server.close()

    // Restore terminal: show cursor + exit alt screen
    process.stdout.write('\x1b[?25h\x1b[?1049l')
  }

  process.once('SIGINT', () => { void stop() })

  return {
    render: async (data: Record<string, unknown>) => { await renderFrame(data) },
    stop,
  }
}

export default { start }
