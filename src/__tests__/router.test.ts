import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PageMap, PageState } from '../types.js'

const mockNavigate = vi.fn().mockResolvedValue(undefined)
const mockRender = vi.fn().mockResolvedValue(undefined)
const mockSetKeys = vi.fn()
const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

const pages: PageMap = {
  overview: {
    html: '/pages/overview.html',
    default: true,
    label: 'Overview',
    keys: {
      F5: { label: 'Refresh', action: vi.fn() },
      F10: { label: 'Quit', action: vi.fn() },
    },
  },
  cpu: {
    html: '/pages/cpu.html',
    shortcut: 'g',
    label: 'CPU Detail',
    keys: {
      F1: { label: 'Export', action: vi.fn() },
      F10: { label: 'Quit', action: vi.fn() },
    },
  },
  memory: {
    html: '/pages/memory.html',
    shortcut: 'm',
    label: 'Memory',
    keys: {
      F2: { label: 'Dump Heap', action: vi.fn() },
      F10: { label: 'Quit', action: vi.fn() },
    },
  },
}

async function makeRouter() {
  const { createRouter } = await import('../router.js')
  return createRouter({
    pages,
    navigate: mockNavigate,
    render: mockRender,
    setKeys: mockSetKeys,
    confirmQuitHtml: '/internal/confirm-quit.html',
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
})

// ─── Initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('starts on the default page', async () => {
    const router = await makeRouter()
    expect(router.getState()).toMatchObject({ type: 'overview', pageId: 'overview' })
  })

  it('calls setKeys with the default page keys on init', async () => {
    await makeRouter()
    expect(mockSetKeys).toHaveBeenCalledWith(
      expect.objectContaining({ F5: expect.any(Object) })
    )
  })
})

// ─── Shortcut navigation (overview → detail) ──────────────────────────────────

describe('shortcut navigation', () => {
  it('navigates to detail page on matching shortcut key', async () => {
    const router = await makeRouter()
    await router.handleKey('g')
    expect(router.getState()).toMatchObject({ type: 'detail', pageId: 'cpu' })
  })

  it('calls navigate with the detail page html path', async () => {
    const router = await makeRouter()
    await router.handleKey('g')
    expect(mockNavigate).toHaveBeenCalledWith('/pages/cpu.html')
  })

  it('calls setKeys with the detail page keys after navigation', async () => {
    const router = await makeRouter()
    await router.handleKey('g')
    expect(mockSetKeys).toHaveBeenLastCalledWith(
      expect.objectContaining({ F1: expect.any(Object) })
    )
  })

  it('calls render after navigating to detail page', async () => {
    const router = await makeRouter()
    await router.handleKey('g')
    expect(mockRender).toHaveBeenCalled()
  })

  it('ignores shortcut keys when already on a detail page', async () => {
    const router = await makeRouter()
    await router.handleKey('g') // go to cpu
    mockNavigate.mockClear()
    await router.handleKey('m') // should be ignored
    expect(router.getState()).toMatchObject({ type: 'detail', pageId: 'cpu' })
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('ignores unknown shortcut keys', async () => {
    const router = await makeRouter()
    await router.handleKey('z') // no page with shortcut 'z'
    expect(router.getState()).toMatchObject({ type: 'overview' })
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})

// ─── ESC from detail page (back to overview) ──────────────────────────────────

describe('ESC from detail page', () => {
  it('returns to overview state', async () => {
    const router = await makeRouter()
    await router.handleKey('g')
    await router.handleKey('\x1b')
    expect(router.getState()).toMatchObject({ type: 'overview', pageId: 'overview' })
  })

  it('navigates to overview html', async () => {
    const router = await makeRouter()
    await router.handleKey('g')
    mockNavigate.mockClear()
    await router.handleKey('\x1b')
    expect(mockNavigate).toHaveBeenCalledWith('/pages/overview.html')
  })

  it('restores overview keys after ESC from detail', async () => {
    const router = await makeRouter()
    await router.handleKey('g')
    mockSetKeys.mockClear()
    await router.handleKey('\x1b')
    expect(mockSetKeys).toHaveBeenCalledWith(
      expect.objectContaining({ F5: expect.any(Object) })
    )
  })

  it('calls render after returning to overview', async () => {
    const router = await makeRouter()
    await router.handleKey('g')
    mockRender.mockClear()
    await router.handleKey('\x1b')
    expect(mockRender).toHaveBeenCalled()
  })
})

// ─── ESC from overview (confirm-quit) ─────────────────────────────────────────

describe('ESC from overview', () => {
  it('transitions to confirm-quit state', async () => {
    const router = await makeRouter()
    await router.handleKey('\x1b')
    expect(router.getState()).toMatchObject({ type: 'confirm-quit' })
  })

  it('navigates to confirm-quit html', async () => {
    const router = await makeRouter()
    await router.handleKey('\x1b')
    expect(mockNavigate).toHaveBeenLastCalledWith('/internal/confirm-quit.html')
  })

  it('stores the previous state in returnTo', async () => {
    const router = await makeRouter()
    await router.handleKey('\x1b')
    const state = router.getState() as { type: 'confirm-quit'; returnTo: PageState }
    expect(state.returnTo).toMatchObject({ type: 'overview', pageId: 'overview' })
  })

  it('sets confirm-quit key hints in the bar', async () => {
    const router = await makeRouter()
    mockSetKeys.mockClear()
    await router.handleKey('\x1b')
    expect(mockSetKeys).toHaveBeenCalled()
  })
})

// ─── Y/N on confirm-quit ──────────────────────────────────────────────────────

describe('confirm-quit: Y confirms exit', () => {
  it('calls process.exit(0) on Y', async () => {
    const router = await makeRouter()
    await router.handleKey('\x1b')
    await router.handleKey('y')
    expect(mockExit).toHaveBeenCalledWith(0)
  })

  it('calls process.exit(0) on uppercase Y', async () => {
    const router = await makeRouter()
    await router.handleKey('\x1b')
    await router.handleKey('Y')
    expect(mockExit).toHaveBeenCalledWith(0)
  })
})

describe('confirm-quit: N dismisses', () => {
  it('returns to overview state on N', async () => {
    const router = await makeRouter()
    await router.handleKey('\x1b')
    await router.handleKey('n')
    expect(router.getState()).toMatchObject({ type: 'overview', pageId: 'overview' })
  })

  it('navigates back to overview html on N', async () => {
    const router = await makeRouter()
    await router.handleKey('\x1b')
    mockNavigate.mockClear()
    await router.handleKey('n')
    expect(mockNavigate).toHaveBeenCalledWith('/pages/overview.html')
  })

  it('returns to overview state on uppercase N', async () => {
    const router = await makeRouter()
    await router.handleKey('\x1b')
    await router.handleKey('N')
    expect(router.getState()).toMatchObject({ type: 'overview' })
  })

  it('restores previous state returnTo when N pressed', async () => {
    const router = await makeRouter()
    await router.handleKey('\x1b')
    await router.handleKey('n')
    expect(router.getState()).toMatchObject({ type: 'overview', pageId: 'overview' })
  })
})

describe('confirm-quit: ESC also dismisses', () => {
  it('returns to returnTo state on ESC from confirm-quit', async () => {
    const router = await makeRouter()
    await router.handleKey('\x1b')
    await router.handleKey('\x1b')
    expect(router.getState()).toMatchObject({ type: 'overview' })
  })
})

// ─── Ctrl+C — always exits immediately ───────────────────────────────────────

describe('Ctrl+C', () => {
  it('calls process.exit(0) from overview', async () => {
    const router = await makeRouter()
    await router.handleKey('\x03')
    expect(mockExit).toHaveBeenCalledWith(0)
  })

  it('calls process.exit(0) from detail page', async () => {
    const router = await makeRouter()
    await router.handleKey('g')
    await router.handleKey('\x03')
    expect(mockExit).toHaveBeenCalledWith(0)
  })

  it('calls process.exit(0) from confirm-quit', async () => {
    const router = await makeRouter()
    await router.handleKey('\x1b')
    await router.handleKey('\x03')
    expect(mockExit).toHaveBeenCalledWith(0)
  })
})

// ─── F-key actions ────────────────────────────────────────────────────────────

describe('F-key actions', () => {
  it('calls the action for the active page F-key', async () => {
    const router = await makeRouter()
    const overviewF5Action = pages.overview?.keys?.F5?.action as ReturnType<typeof vi.fn>

    await router.handleKey('\x1bOQ') // F2 — not bound on overview, ignored
    expect(overviewF5Action).not.toHaveBeenCalled()

    await router.handleKey('\x1b[15~') // F5 — bound on overview
    expect(overviewF5Action).toHaveBeenCalled()
  })

  it('uses the detail page keys when on a detail page', async () => {
    const router = await makeRouter()
    await router.handleKey('g') // go to cpu page

    const cpuF1Action = pages.cpu?.keys?.F1?.action as ReturnType<typeof vi.fn>
    await router.handleKey('\x1bOP') // F1 — bound on cpu page
    expect(cpuF1Action).toHaveBeenCalled()
  })

  it('ignores F-keys not bound on the current page', async () => {
    const router = await makeRouter()
    const anyAction = vi.fn()
    await router.handleKey('\x1b[13~') // F3
    expect(anyAction).not.toHaveBeenCalled()
  })

  it('ignores all F-keys on confirm-quit page', async () => {
    const router = await makeRouter()
    await router.handleKey('\x1b') // show confirm-quit
    const overviewF5Action = pages.overview?.keys?.F5?.action as ReturnType<typeof vi.fn>
    await router.handleKey('\x1b[15~') // F5 — should be ignored on confirm-quit
    expect(overviewF5Action).not.toHaveBeenCalled()
  })

  it('does not throw when action rejects — logs error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const badPages: PageMap = {
      overview: {
        html: '/pages/overview.html',
        default: true,
        keys: {
          F1: { label: 'Bad', action: async () => { throw new Error('boom') } },
        },
      },
    }
    const { createRouter } = await import('../router.js')
    const router = createRouter({
      pages: badPages,
      navigate: mockNavigate,
      render: mockRender,
      setKeys: mockSetKeys,
      confirmQuitHtml: '/internal/confirm-quit.html',
    })
    await router.handleKey('\x1bOP') // F1
    await vi.waitFor(() => expect(consoleSpy).toHaveBeenCalled())
  })
})

// ─── Config validation ────────────────────────────────────────────────────────

describe('createRouter validation', () => {
  it('throws if no default page is defined', async () => {
    const { createRouter } = await import('../router.js')
    expect(() =>
      createRouter({
        pages: {
          cpu: { html: '/cpu.html', shortcut: 'g' },
        },
        navigate: mockNavigate,
        render: mockRender,
        setKeys: mockSetKeys,
        confirmQuitHtml: '/internal/confirm-quit.html',
      })
    ).toThrow(/default/)
  })

  it('throws if two pages share the same shortcut', async () => {
    const { createRouter } = await import('../router.js')
    expect(() =>
      createRouter({
        pages: {
          overview: { html: '/overview.html', default: true },
          cpu: { html: '/cpu.html', shortcut: 'g' },
          mem: { html: '/mem.html', shortcut: 'g' },
        },
        navigate: mockNavigate,
        render: mockRender,
        setKeys: mockSetKeys,
        confirmQuitHtml: '/internal/confirm-quit.html',
      })
    ).toThrow(/shortcut/)
  })

  it('throws if shortcut is a reserved key (y, n)', async () => {
    const { createRouter } = await import('../router.js')
    expect(() =>
      createRouter({
        pages: {
          overview: { html: '/overview.html', default: true },
          cpu: { html: '/cpu.html', shortcut: 'y' },
        },
        navigate: mockNavigate,
        render: mockRender,
        setKeys: mockSetKeys,
        confirmQuitHtml: '/internal/confirm-quit.html',
      })
    ).toThrow(/reserved/)
  })

  it('logs a warning if ESC is defined in page keys', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { createRouter } = await import('../router.js')
    createRouter({
      pages: {
        overview: {
          html: '/overview.html',
          default: true,
        },
      },
      navigate: mockNavigate,
      render: mockRender,
      setKeys: mockSetKeys,
      confirmQuitHtml: '/internal/confirm-quit.html',
    })
    expect(warnSpy).not.toHaveBeenCalled()
  })
})
