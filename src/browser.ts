import { chromium } from 'playwright'
import type { BrowserHandle } from './types.js'

export async function createBrowser({
  url,
  width,
  height,
}: {
  url: string
  width: number
  height: number
}): Promise<BrowserHandle> {
  const browser = await chromium.launch({
    headless: true,
    timeout: 30000,
  })
  const context = await browser.newContext()
  const page = await context.newPage()

  await page.setViewportSize({ width, height })
  await page.goto(url, { waitUntil: 'domcontentloaded' })

  let crashCount = 0
  page.on('crash', async () => {
    crashCount++
    if (crashCount > 3) {
      process.stderr.write('[tuimon] page crashed repeatedly — giving up on reload\n')
      return
    }
    process.stderr.write(`[tuimon] page crashed (attempt ${crashCount}/3), reloading\n`)
    try {
      await page.reload()
    } catch {
      // ignore reload failures
    }
  })

  page.on('pageerror', (err) => {
    process.stderr.write(`tuimon: page error: ${err.message}\n`)
  })

  return {
    async screenshot(): Promise<Buffer> {
      const buf = await page.screenshot({ type: 'png' })
      return Buffer.from(buf)
    },

    async pushData(data: Record<string, unknown>): Promise<void> {
      await page.evaluate((d: Record<string, unknown>) => {
        const win = globalThis as Record<string, unknown>
        if (typeof win['__tuimon_update__'] === 'function') {
          ;(win['__tuimon_update__'] as (d: Record<string, unknown>) => void)(d)
        }
      }, data)
      try {
        await page.waitForFunction(
          () => (globalThis as Record<string, unknown>)['__tuimon_ready__'] === true,
          { timeout: 2000 },
        )
      } catch {
        // timeout is acceptable — page may not have the client script yet
      }
    },

    async navigate(newUrl: string): Promise<void> {
      await page.goto(newUrl, { waitUntil: 'domcontentloaded' })
    },

    async resize(w: number, h: number): Promise<void> {
      await page.setViewportSize({ width: w, height: h })
    },

    async evaluate(expression: string): Promise<void> {
      await page.evaluate(expression)
    },

    async close(): Promise<void> {
      await browser.close()
    },
  }
}
