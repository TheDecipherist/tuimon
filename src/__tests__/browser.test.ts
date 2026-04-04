import { describe, it, expect, vi, afterEach } from 'vitest'

const mockPage = {
  setViewportSize: vi.fn().mockResolvedValue(undefined),
  goto: vi.fn().mockResolvedValue(undefined),
  screenshot: vi.fn().mockResolvedValue(Buffer.from('screenshot')),
  evaluate: vi.fn().mockResolvedValue(undefined),
  waitForFunction: vi.fn().mockResolvedValue(undefined),
  reload: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
}
const mockContext = { newPage: vi.fn().mockResolvedValue(mockPage) }
const mockBrowser = { newContext: vi.fn().mockResolvedValue(mockContext), close: vi.fn().mockResolvedValue(undefined) }

vi.mock('playwright', () => ({ chromium: { launch: vi.fn().mockResolvedValue(mockBrowser) } }))

afterEach(() => { vi.clearAllMocks() })

describe('createBrowser', () => {
  it('launches chromium headless', async () => {
    const playwright = await import('playwright')
    const { createBrowser } = await import('../browser.js')
    await createBrowser({ url: 'http://localhost:7337', width: 1600, height: 900 })
    expect(playwright.chromium.launch).toHaveBeenCalledWith(expect.objectContaining({ headless: true }))
  })

  it('sets viewport dimensions', async () => {
    const { createBrowser } = await import('../browser.js')
    await createBrowser({ url: 'http://localhost:7337', width: 1280, height: 720 })
    expect(mockPage.setViewportSize).toHaveBeenCalledWith({ width: 1280, height: 720 })
  })

  it('navigates to initial URL', async () => {
    const { createBrowser } = await import('../browser.js')
    await createBrowser({ url: 'http://localhost:7337', width: 1600, height: 900 })
    expect(mockPage.goto).toHaveBeenCalledWith('http://localhost:7337', expect.any(Object))
  })

  it('screenshot() returns Buffer', async () => {
    const { createBrowser } = await import('../browser.js')
    const b = await createBrowser({ url: 'http://localhost:7337', width: 1600, height: 900 })
    expect(await b.screenshot()).toBeInstanceOf(Buffer)
  })

  it('pushData() calls page.evaluate', async () => {
    const { createBrowser } = await import('../browser.js')
    const b = await createBrowser({ url: 'http://localhost:7337', width: 1600, height: 900 })
    await b.pushData({ cpu: 42 })
    expect(mockPage.evaluate).toHaveBeenCalledWith(expect.any(Function), { cpu: 42 })
  })

  it('navigate() calls page.goto with new URL', async () => {
    const { createBrowser } = await import('../browser.js')
    const b = await createBrowser({ url: 'http://localhost:7337', width: 1600, height: 900 })
    mockPage.goto.mockClear()
    await b.navigate('http://localhost:7337/cpu.html')
    expect(mockPage.goto).toHaveBeenCalledWith('http://localhost:7337/cpu.html', expect.any(Object))
  })

  it('resize() calls setViewportSize', async () => {
    const { createBrowser } = await import('../browser.js')
    const b = await createBrowser({ url: 'http://localhost:7337', width: 1600, height: 900 })
    await b.resize(1280, 600)
    expect(mockPage.setViewportSize).toHaveBeenLastCalledWith({ width: 1280, height: 600 })
  })

  it('close() closes the browser', async () => {
    const { createBrowser } = await import('../browser.js')
    const b = await createBrowser({ url: 'http://localhost:7337', width: 1600, height: 900 })
    await b.close()
    expect(mockBrowser.close).toHaveBeenCalled()
  })
})
