import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../detect.js', () => ({
  detectGraphicsSupport: vi.fn().mockResolvedValue({ kitty: true, sixel: false, iterm2: false, protocol: 'kitty' }),
  getTerminalDimensions: vi.fn().mockResolvedValue({ cols: 220, rows: 50, pixelWidth: 1760, pixelHeight: 980 }),
}))

vi.mock('../server.js', () => ({
  startServer: vi.fn().mockResolvedValue({
    url: 'http://localhost:7337',
    urlFor: (f: string) => `http://localhost:7337/${f}`,
    close: vi.fn().mockResolvedValue(undefined),
  }),
}))

const mockBrowser = {
  screenshot: vi.fn().mockResolvedValue(Buffer.from('img')),
  pushData: vi.fn().mockResolvedValue(undefined),
  navigate: vi.fn().mockResolvedValue(undefined),
  resize: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
}

vi.mock('../browser.js', () => ({ createBrowser: vi.fn().mockResolvedValue(mockBrowser) }))
vi.mock('../encoder.js', () => ({ encodeAndRender: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../keyhandler.js', () => ({ startKeyHandler: vi.fn().mockReturnValue({ stop: vi.fn() }) }))
vi.mock('../fkeybar.js', () => ({ renderFKeyBar: vi.fn().mockReturnValue({ setKeys: vi.fn(), notify: vi.fn(), redraw: vi.fn(), stop: vi.fn() }) }))
vi.mock('../router.js', () => ({
  createRouter: vi.fn().mockReturnValue({
    handleKey: vi.fn().mockResolvedValue(undefined),
    getState: vi.fn().mockReturnValue({ type: 'overview', pageId: 'overview' }),
  }),
}))

const testOptions = {
  pages: {
    overview: { html: './pages/overview.html', default: true as const, keys: {} },
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
})

describe('tuimon.start()', () => {
  it('returns render and stop', async () => {
    const { default: tuimon } = await import('../index.js')
    const dash = await tuimon.start(testOptions)
    expect(typeof dash.render).toBe('function')
    expect(typeof dash.stop).toBe('function')
  })

  it('runs detectGraphicsSupport', async () => {
    const { detectGraphicsSupport } = await import('../detect.js')
    const { default: tuimon } = await import('../index.js')
    await tuimon.start(testOptions)
    expect(detectGraphicsSupport).toHaveBeenCalled()
  })

  it('starts server with html directory', async () => {
    const { startServer } = await import('../server.js')
    const { default: tuimon } = await import('../index.js')
    await tuimon.start(testOptions)
    expect(startServer).toHaveBeenCalled()
  })

  it('creates browser with pixel dimensions', async () => {
    const { createBrowser } = await import('../browser.js')
    const { default: tuimon } = await import('../index.js')
    await tuimon.start(testOptions)
    expect(createBrowser).toHaveBeenCalledWith(expect.objectContaining({ width: 1760 }))
  })

  it('creates the router', async () => {
    const { createRouter } = await import('../router.js')
    const { default: tuimon } = await import('../index.js')
    await tuimon.start(testOptions)
    expect(createRouter).toHaveBeenCalled()
  })
})

describe('dash.render()', () => {
  it('pushes data to browser', async () => {
    const { default: tuimon } = await import('../index.js')
    const dash = await tuimon.start(testOptions)
    await dash.render({ cpu: 55 })
    expect(mockBrowser.pushData).toHaveBeenCalledWith({ cpu: 55 })
  })

  it('calls encodeAndRender after screenshot', async () => {
    const { encodeAndRender } = await import('../encoder.js')
    const { default: tuimon } = await import('../index.js')
    const dash = await tuimon.start(testOptions)
    await dash.render({ cpu: 10 })
    expect(encodeAndRender).toHaveBeenCalled()
  })
})

describe('dash.stop()', () => {
  it('closes the browser', async () => {
    const { default: tuimon } = await import('../index.js')
    const dash = await tuimon.start(testOptions)
    await dash.stop()
    expect(mockBrowser.close).toHaveBeenCalled()
  })

  it('stops the key handler', async () => {
    const { startKeyHandler } = await import('../keyhandler.js')
    const { default: tuimon } = await import('../index.js')
    const dash = await tuimon.start(testOptions)
    await dash.stop()
    const h = (startKeyHandler as ReturnType<typeof vi.fn>).mock.results[0]?.value
    expect(h.stop).toHaveBeenCalled()
  })
})
