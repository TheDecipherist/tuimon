import type { PageMap, PageState, FKeyMap, FKey, RouterHandle } from './types.js'

export interface RouterDeps {
  pages: PageMap
  navigate: (url: string) => Promise<void>
  render: (data?: Record<string, unknown>) => Promise<void>
  setKeys: (keys: FKeyMap) => void
  confirmQuitHtml: string
}

// ─── Key sequence → FKey mapping ─────────────────────────────────────────────

const SEQ_TO_FKEY: Record<string, FKey> = {
  '\x1bOP':   'F1',  '\x1b[11~': 'F1',
  '\x1bOQ':   'F2',  '\x1b[12~': 'F2',
  '\x1bOR':   'F3',  '\x1b[13~': 'F3',
  '\x1bOS':   'F4',  '\x1b[14~': 'F4',
  '\x1b[15~': 'F5',
  '\x1b[17~': 'F6',
  '\x1b[18~': 'F7',
  '\x1b[19~': 'F8',
  '\x1b[20~': 'F9',
  '\x1b[21~': 'F10',
  '\x1b[23~': 'F11',
  '\x1b[24~': 'F12',
}

const RESERVED_SHORTCUTS = new Set(['y', 'n', '\x1b', '\x03'])

const ESC = '\x1b'
const CTRL_C = '\x03'

// ─── createRouter ────────────────────────────────────────────────────────────

export function createRouter(deps: RouterDeps): RouterHandle {
  const { pages, navigate, render, setKeys, confirmQuitHtml } = deps

  // ── Validation ──────────────────────────────────────────────────────────

  // Exactly one default page
  const defaultEntries = Object.entries(pages).filter(([, cfg]) => cfg.default)
  if (defaultEntries.length !== 1) {
    throw new Error(
      `Exactly one page must have default: true, found ${defaultEntries.length}`
    )
  }
  const [defaultPageId, defaultPageConfig] = defaultEntries[0]!

  // Shortcut uniqueness and reserved check
  const seenShortcuts = new Map<string, string>()
  for (const [id, cfg] of Object.entries(pages)) {
    if (cfg.shortcut != null) {
      if (RESERVED_SHORTCUTS.has(cfg.shortcut)) {
        throw new Error(
          `Page "${id}" uses reserved shortcut '${cfg.shortcut}'`
        )
      }
      if (seenShortcuts.has(cfg.shortcut)) {
        throw new Error(
          `Duplicate shortcut '${cfg.shortcut}' on pages "${seenShortcuts.get(cfg.shortcut)}" and "${id}"`
        )
      }
      seenShortcuts.set(cfg.shortcut, id)
    }

    // Warn if ESC or Ctrl+C defined in page keys
    if (cfg.keys) {
      for (const key of Object.keys(cfg.keys)) {
        if (key === 'ESC' || key === 'Escape' || key === CTRL_C) {
          console.warn(
            `[tuimon] Page "${id}" defines reserved key "${key}" in its key map — it will be ignored`
          )
        }
      }
    }
  }

  // ── Shortcut → pageId lookup ────────────────────────────────────────────

  const shortcutToPageId = new Map<string, string>()
  for (const [id, cfg] of Object.entries(pages)) {
    if (cfg.shortcut) {
      shortcutToPageId.set(cfg.shortcut, id)
    }
  }

  // ── State ───────────────────────────────────────────────────────────────

  let state: PageState = { type: 'overview', pageId: defaultPageId }

  // Set initial keys
  setKeys(defaultPageConfig.keys ?? {})

  // ── Confirm-quit keys ───────────────────────────────────────────────────

  const confirmQuitKeys: FKeyMap = {}

  // ── Helpers ─────────────────────────────────────────────────────────────

  function getPageKeys(pageId: string): FKeyMap {
    return pages[pageId]?.keys ?? {}
  }

  function getPageHtml(pageId: string): string {
    const page = pages[pageId]
    if (!page) throw new Error(`[tuimon] Unknown page: "${pageId}"`)
    return page.html
  }

  async function goToPage(pageState: PageState): Promise<void> {
    state = pageState
    const pageId =
      pageState.type === 'confirm-quit'
        ? null
        : pageState.pageId

    if (pageState.type === 'confirm-quit') {
      await navigate(confirmQuitHtml)
      setKeys(confirmQuitKeys)
    } else {
      await navigate(getPageHtml(pageId!))
      setKeys(getPageKeys(pageId!))
      await render()
    }
  }

  // ── handleKey ───────────────────────────────────────────────────────────

  async function handleKey(key: string): Promise<void> {
    // Ctrl+C always exits immediately
    if (key === CTRL_C) {
      process.exit(0)
      return
    }

    // ── confirm-quit state ────────────────────────────────────────────────
    if (state.type === 'confirm-quit') {
      const lower = key.toLowerCase()

      if (lower === 'y') {
        process.exit(0)
        return
      }

      if (lower === 'n' || key === ESC) {
        await goToPage(state.returnTo)
        return
      }

      // Ignore everything else (including F-keys) on confirm-quit
      return
    }

    // ── Check for F-key sequences ─────────────────────────────────────────
    const fkey = SEQ_TO_FKEY[key]
    if (fkey) {
      const currentPageId = state.pageId
      const binding = getPageKeys(currentPageId)[fkey]
      if (binding) {
        try {
          await Promise.resolve(binding.action())
        } catch (err) {
          console.error('[tuimon]', err)
        }
      }
      return
    }

    // ── ESC ───────────────────────────────────────────────────────────────
    if (key === ESC) {
      if (state.type === 'detail') {
        // Back to overview
        await goToPage({ type: 'overview', pageId: defaultPageId })
      } else if (state.type === 'overview') {
        // Show confirm-quit
        const returnTo = { ...state }
        state = { type: 'confirm-quit', returnTo }
        await navigate(confirmQuitHtml)
        setKeys(confirmQuitKeys)
      }
      return
    }

    // ── Shortcut keys (only from overview) ────────────────────────────────
    if (state.type === 'overview') {
      const targetPageId = shortcutToPageId.get(key)
      if (targetPageId) {
        await goToPage({ type: 'detail', pageId: targetPageId })
      }
    }

    // detail state ignores shortcut keys — no action needed
  }

  // ── Public API ──────────────────────────────────────────────────────────

  return {
    handleKey,
    getState: () => state,
  }
}
