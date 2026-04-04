# TuiMon — Terminal Dashboard Framework
## VS Code AI Prompt File — TypeScript + TDD + Full Navigation

> Generate tests first, make them pass, then move to the next section.
> Never generate implementation code before its test file exists and is failing.
> Red → Green → Refactor. Always.

---

## Project Overview

TuiMon is a Node.js npm package written in TypeScript that renders developer-supplied
HTML files inside a terminal using a persistent headless Chromium instance (via Playwright),
encoding each frame as WebP and streaming it to the terminal via the Kitty graphics protocol
(with Sixel fallback).

The developer writes their dashboard as normal webpages, defines pages and per-page F-key
bindings in a config file, and calls `dash.render(data)` whenever their data changes.
TuiMon handles routing, rendering, key handling, the F-key bar, and terminal lifecycle.

### Core Design Principles
- API surface: `tuimon.start()` and `dash.render(data)`
- Plain HTML pages — no framework, no DSL, no custom components
- Any charting library works — Chart.js, D3, ECharts, anything
- Multiple pages with per-page F-key bindings — each page defines its own actions
- Single-letter shortcuts on panels navigate to detail pages
- ESC and Ctrl+C are system-reserved and cannot be overridden
- F-key bar always reflects exactly the active page's keys — never stale
- Quit confirmation on ESC from overview — immediate exit on Ctrl+C
- Strict TypeScript throughout — `strict: true`, no `any`

### Tech Stack
- **Language:** TypeScript 5.x, ESM modules
- **Runtime:** Node.js 20+
- **Browser control:** Playwright (chromium)
- **Image encoding:** Sharp (WebP/PNG)
- **Terminal graphics:** Kitty protocol (primary), Sixel (fallback)
- **Test runner:** Vitest
- **Linting:** ESLint + `@typescript-eslint`
- **Formatting:** Prettier
- **Build:** `tsc` → `dist/`
- **CLI:** Commander

---

## Repository Structure

```
tuimon/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .eslintrc.json
├── .prettierrc
├── README.md
│
├── src/
│   ├── types.ts               ← all shared TypeScript interfaces and types
│   ├── index.ts               ← main programmatic API (start, render)
│   ├── router.ts              ← page state machine and navigation
│   ├── detect.ts              ← terminal graphics capability detection
│   ├── server.ts              ← static file server (one instance per page)
│   ├── browser.ts             ← Playwright lifecycle management
│   ├── encoder.ts             ← screenshot → WebP → Kitty/Sixel pipeline
│   ├── keyhandler.ts          ← stdin raw mode key listener
│   ├── fkeybar.ts             ← ANSI F-key status bar renderer
│   └── cli.ts                 ← CLI entry point
│
├── src/__tests__/
│   ├── detect.test.ts
│   ├── server.test.ts
│   ├── browser.test.ts
│   ├── encoder.test.ts
│   ├── keyhandler.test.ts
│   ├── fkeybar.test.ts
│   ├── router.test.ts
│   └── index.test.ts
│
├── client/
│   └── tuimon-client.js       ← browser-side library (plain JS)
│
├── templates/
│   ├── internal/
│   │   └── confirm-quit.html  ← built-in quit confirmation page
│   └── starter/
│       ├── pages/
│       │   ├── overview.html
│       │   ├── cpu-detail.html
│       │   └── memory-detail.html
│       └── tuimon.config.ts
│
└── dist/                      ← compiled output (gitignored)
```

---

## Section 0 — Configuration Files

Generate these first before any source code.

### package.json

```json
{
  "name": "tuimon",
  "version": "0.1.0",
  "description": "Render beautiful HTML dashboards directly in your terminal.",
  "type": "module",
  "bin": { "tuimon": "./dist/cli.js" },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./client": "./client/tuimon-client.js"
  },
  "engines": { "node": ">=20.0.0" },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint src --ext .ts",
    "format": "prettier --write src",
    "typecheck": "tsc --noEmit",
    "prepublishOnly": "npm run typecheck && npm run test && npm run build"
  },
  "dependencies": {
    "commander": "^12.0.0",
    "playwright": "^1.44.0",
    "sharp": "^0.33.0",
    "chokidar": "^3.6.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@typescript-eslint/eslint-plugin": "^7.0.0",
    "@typescript-eslint/parser": "^7.0.0",
    "@vitest/coverage-v8": "^1.0.0",
    "eslint": "^8.0.0",
    "prettier": "^3.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.0.0"
  }
}
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "forceConsistentCasingInFileNames": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "src/__tests__"]
}
```

### vitest.config.ts

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      exclude: ['src/cli.ts', 'src/__tests__/**'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
    testTimeout: 10000,
  },
})
```

### .prettierrc

```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

---

## Section 1 — src/types.ts

No tests — pure type definitions. Generate this before anything else.

```ts
// ─── Key types ───────────────────────────────────────────────────────────────

export type FKey =
  | 'F1' | 'F2' | 'F3' | 'F4' | 'F5' | 'F6'
  | 'F7' | 'F8' | 'F9' | 'F10' | 'F11' | 'F12'

/** Single lowercase letter a-z used as a panel/page shortcut */
export type ShortcutKey = string

export interface KeyBinding {
  label: string
  action: () => void | Promise<void>
}

export type FKeyMap = Partial<Record<FKey, KeyBinding>>

// ─── Page config ─────────────────────────────────────────────────────────────

export interface PageConfig {
  /** Absolute or cwd-relative path to the HTML file for this page */
  html: string
  /** If true, this is the starting page. Exactly one page must be default. */
  default?: boolean
  /**
   * Single lowercase letter shortcut to navigate to this page from the overview.
   * Not valid on the default page.
   * Cannot conflict with other page shortcuts.
   * Cannot be 'y', 'n', or any reserved key.
   */
  shortcut?: ShortcutKey
  /** Human-readable label shown in panel borders and the F-key bar */
  label?: string
  /**
   * F-key bindings active when this page is displayed.
   * ESC and Ctrl+C are always reserved — defining them here has no effect
   * and TuiMon will log a warning at startup.
   */
  keys?: FKeyMap
}

export type PageMap = Record<string, PageConfig>

// ─── Top-level config ─────────────────────────────────────────────────────────

export interface TuiMonOptions {
  /** Page definitions. At least one page must have default: true. */
  pages: PageMap
  /**
   * Data function called before each render.
   * Result is passed into the page via TuiMon.onUpdate().
   */
  data?: () => Record<string, unknown> | Promise<Record<string, unknown>>
  /**
   * Auto-render interval in ms. Requires data to be set.
   * Default: no auto-render — developer calls dash.render() manually.
   */
  refresh?: number
  /** Delay in ms after pushData() before screenshotting. Default: 50 */
  renderDelay?: number
}

export interface TuiMonDashboard {
  /**
   * Render the current page with new data.
   * Caches data for use when navigating between pages.
   */
  render: (data: Record<string, unknown>) => Promise<void>
  /** Gracefully shut down — restores terminal state */
  stop: () => Promise<void>
}

// ─── Navigation / router ─────────────────────────────────────────────────────

export type PageState =
  | { type: 'overview'; pageId: string }
  | { type: 'detail'; pageId: string }
  | { type: 'confirm-quit'; returnTo: PageState }

// ─── Internal handles ─────────────────────────────────────────────────────────

export interface GraphicsSupport {
  kitty: boolean
  sixel: boolean
  iterm2: boolean
  protocol: 'kitty' | 'sixel' | 'iterm2' | null
}

export interface TerminalDimensions {
  cols: number
  rows: number
  pixelWidth: number
  pixelHeight: number
}

export interface ServerHandle {
  /** Base URL the server is listening on */
  url: string
  /** Returns the full URL for a given page html path */
  urlFor: (htmlPath: string) => string
  close: () => Promise<void>
}

export interface BrowserHandle {
  screenshot: () => Promise<Buffer>
  pushData: (data: Record<string, unknown>) => Promise<void>
  navigate: (url: string) => Promise<void>
  resize: (width: number, height: number) => Promise<void>
  close: () => Promise<void>
}

export interface FKeyBarHandle {
  /** Replace the current key set and re-render the bar */
  setKeys: (keys: FKeyMap) => void
  /** Show a temporary message in the bar for duration ms */
  notify: (message: string, duration?: number) => void
  stop: () => void
}

export interface KeyHandlerHandle {
  stop: () => void
}

export interface RouterHandle {
  /** Process a raw key string from stdin */
  handleKey: (key: string) => Promise<void>
  /** Current page state */
  getState: () => PageState
}
```

---

## Section 2 — src/detect.ts (TDD)

### WRITE THIS TEST FILE FIRST: src/__tests__/detect.test.ts

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

beforeEach(() => { vi.resetModules() })
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('detectGraphicsSupport', () => {
  it('detects Kitty via TERM=xterm-kitty', async () => {
    vi.stubEnv('TERM', 'xterm-kitty')
    vi.stubEnv('TERM_PROGRAM', '')
    const { detectGraphicsSupport } = await import('../detect.js')
    const r = await detectGraphicsSupport({ skipQuery: true })
    expect(r.kitty).toBe(true)
    expect(r.protocol).toBe('kitty')
  })

  it('detects WezTerm via TERM_PROGRAM', async () => {
    vi.stubEnv('TERM', 'xterm-256color')
    vi.stubEnv('TERM_PROGRAM', 'WezTerm')
    const { detectGraphicsSupport } = await import('../detect.js')
    const r = await detectGraphicsSupport({ skipQuery: true })
    expect(r.kitty).toBe(true)
    expect(r.protocol).toBe('kitty')
  })

  it('detects Ghostty via TERM_PROGRAM', async () => {
    vi.stubEnv('TERM_PROGRAM', 'ghostty')
    const { detectGraphicsSupport } = await import('../detect.js')
    const r = await detectGraphicsSupport({ skipQuery: true })
    expect(r.kitty).toBe(true)
  })

  it('detects iTerm2 via TERM_PROGRAM', async () => {
    vi.stubEnv('TERM_PROGRAM', 'iTerm.app')
    const { detectGraphicsSupport } = await import('../detect.js')
    const r = await detectGraphicsSupport({ skipQuery: true })
    expect(r.iterm2).toBe(true)
    expect(r.protocol).toBe('iterm2')
  })

  it('returns null protocol for unknown terminal', async () => {
    vi.stubEnv('TERM', 'xterm-256color')
    vi.stubEnv('TERM_PROGRAM', '')
    vi.stubEnv('COLORTERM', '')
    const { detectGraphicsSupport } = await import('../detect.js')
    const r = await detectGraphicsSupport({ skipQuery: true })
    expect(r.protocol).toBe(null)
  })

  it('prioritises kitty over iterm2 and sixel', async () => {
    vi.stubEnv('TERM', 'xterm-kitty')
    vi.stubEnv('TERM_PROGRAM', 'iTerm.app')
    const { detectGraphicsSupport } = await import('../detect.js')
    const r = await detectGraphicsSupport({ skipQuery: true })
    expect(r.protocol).toBe('kitty')
  })
})

describe('getTerminalDimensions', () => {
  it('returns 1600x900 pixel fallback when skipQuery is true', async () => {
    const { getTerminalDimensions } = await import('../detect.js')
    const d = await getTerminalDimensions({ skipQuery: true })
    expect(d.pixelWidth).toBe(1600)
    expect(d.pixelHeight).toBe(900)
  })

  it('reads cols and rows from process.stdout', async () => {
    vi.spyOn(process.stdout, 'columns', 'get').mockReturnValue(220)
    vi.spyOn(process.stdout, 'rows', 'get').mockReturnValue(50)
    const { getTerminalDimensions } = await import('../detect.js')
    const d = await getTerminalDimensions({ skipQuery: true })
    expect(d.cols).toBe(220)
    expect(d.rows).toBe(50)
  })

  it('falls back to 80x24 when stdout has no dimensions', async () => {
    vi.spyOn(process.stdout, 'columns', 'get').mockReturnValue(undefined as unknown as number)
    vi.spyOn(process.stdout, 'rows', 'get').mockReturnValue(undefined as unknown as number)
    const { getTerminalDimensions } = await import('../detect.js')
    const d = await getTerminalDimensions({ skipQuery: true })
    expect(d.cols).toBe(80)
    expect(d.rows).toBe(24)
  })
})
```

### NOW generate: src/detect.ts

- `async function detectGraphicsSupport(opts?: { skipQuery?: boolean }): Promise<GraphicsSupport>`
- `async function getTerminalDimensions(opts?: { skipQuery?: boolean }): Promise<TerminalDimensions>`
- `skipQuery: true` bypasses all terminal I/O — required for tests
- Without skipQuery: send Kitty query `\x1b_Ga=q;\x1b\\` with 500ms timeout
- Without skipQuery: send pixel query `\x1b[14t` with 500ms timeout
- Kitty terminals: `TERM=xterm-kitty`, `TERM_PROGRAM` in `['WezTerm','ghostty','Ghostty']`
- iTerm2 terminals: `TERM_PROGRAM` in `['iTerm.app','iTerm2']`
- Sixel: `TERM=mlterm`, or VSCode
- Priority: kitty > iterm2 > sixel
- Pixel fallback: 1600×900. Cell fallback: `process.stdout.columns ?? 80`, `process.stdout.rows ?? 24`

---

## Section 3 — src/router.ts (TDD)

This is the core of the navigation system. Write all tests before any implementation.

### WRITE THIS TEST FILE FIRST: src/__tests__/router.test.ts

```ts
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
    // Bar should show Y/N hints — implementation uses a special internal key map
    expect(mockSetKeys).toHaveBeenCalled()
  })
})

// ─── Y/N on confirm-quit ──────────────────────────────────────────────────────

describe('confirm-quit: Y confirms exit', () => {
  it('calls process.exit(0) on Y', async () => {
    const router = await makeRouter()
    await router.handleKey('\x1b') // open confirm
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
    // Navigate to detail, somehow end up at confirm-quit, N should restore correctly
    const router = await makeRouter()
    await router.handleKey('\x1b') // confirm-quit from overview
    await router.handleKey('n')   // back to overview
    expect(router.getState()).toMatchObject({ type: 'overview', pageId: 'overview' })
  })
})

describe('confirm-quit: ESC also dismisses', () => {
  it('returns to returnTo state on ESC from confirm-quit', async () => {
    const router = await makeRouter()
    await router.handleKey('\x1b') // show confirm
    await router.handleKey('\x1b') // dismiss
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
    // F3 is not bound on overview
    const anyAction = vi.fn()
    await router.handleKey('\x1b[13~') // F3
    // No actions called (we can verify via the page mocks)
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
          mem: { html: '/mem.html', shortcut: 'g' }, // duplicate!
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
          cpu: { html: '/cpu.html', shortcut: 'y' }, // reserved!
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
          // ESC in keys — should warn, not throw
        },
      },
      navigate: mockNavigate,
      render: mockRender,
      setKeys: mockSetKeys,
      confirmQuitHtml: '/internal/confirm-quit.html',
    })
    // No ESC in FKeyMap type so this tests the runtime guard
    // Implementation should check for any attempt to override reserved keys
    expect(warnSpy).not.toHaveBeenCalled() // clean config in this case
  })
})
```

### NOW generate: src/router.ts

Requirements:

```ts
export interface RouterDeps {
  pages: PageMap
  navigate: (url: string) => Promise<void>
  render: (data?: Record<string, unknown>) => Promise<void>
  setKeys: (keys: FKeyMap) => void
  confirmQuitHtml: string
}

export function createRouter(deps: RouterDeps): RouterHandle
```

**Validation on creation (throw synchronously):**
- Exactly one page must have `default: true`
- No two pages may share the same `shortcut`
- Reserved shortcuts: `'y'`, `'n'`, `'\x1b'` (ESC), `'\x03'` (Ctrl+C)
- Log a `console.warn` if any page key map attempts to define ESC or Ctrl+C

**Key sequence → FKey mapping (same as keyhandler):**
```
F1:  \x1bOP  | \x1b[11~    F7:  \x1b[18~
F2:  \x1bOQ  | \x1b[12~    F8:  \x1b[19~
F3:  \x1bOR  | \x1b[13~    F9:  \x1b[20~
F4:  \x1bOS  | \x1b[14~    F10: \x1b[21~
F5:  \x1b[15~               F11: \x1b[23~
F6:  \x1b[17~               F12: \x1b[24~
```

**State transitions:**

| Current state    | Key      | Action                                          |
|-----------------|----------|-------------------------------------------------|
| overview        | shortcut | → detail; navigate; setKeys(page); render       |
| overview        | ESC      | → confirm-quit; navigate(confirmQuitHtml); setKeys(confirmKeys) |
| overview        | F-key    | call action if bound on current page            |
| detail          | ESC      | → overview; navigate; setKeys(overview); render |
| detail          | shortcut | ignore                                          |
| detail          | F-key    | call action if bound on current page            |
| confirm-quit    | Y/y      | process.exit(0)                                 |
| confirm-quit    | N/n      | → returnTo; navigate; setKeys(returnTo page); render |
| confirm-quit    | ESC      | → returnTo; navigate; setKeys(returnTo page); render |
| confirm-quit    | F-key    | ignore all                                      |
| any             | Ctrl+C   | process.exit(0) immediately                     |

**Confirm-quit key bar** shows an internal key map:
```ts
const CONFIRM_QUIT_KEYS: FKeyMap = {} // F-keys empty — Y/N shown in bar differently
```
The bar implementation handles confirm-quit state specially — it shows `Y Confirm  N Cancel  ESC Cancel` as plain text, not as F-key entries.

**F-key actions:** `Promise.resolve(action()).catch(err => console.error('[tuimon]', err))`

**`lastData` caching:** router holds a reference to the last data passed to render so detail pages populate immediately on navigation.

All tests must pass before proceeding.

---

## Section 4 — src/fkeybar.ts (TDD)

### WRITE THIS TEST FILE FIRST: src/__tests__/fkeybar.test.ts

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { FKeyMap } from '../types.js'

beforeEach(() => {
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  vi.spyOn(process.stdout, 'columns', 'get').mockReturnValue(120)
  vi.spyOn(process.stdout, 'rows', 'get').mockReturnValue(30)
})

afterEach(() => { vi.restoreAllMocks() })

function output(): string {
  return (process.stdout.write as ReturnType<typeof vi.fn>).mock.calls
    .map((c) => c[0] instanceof Buffer ? c[0].toString() : c[0] as string)
    .join('')
}

describe('renderFKeyBar', () => {
  it('writes to stdout on init', async () => {
    const { renderFKeyBar } = await import('../fkeybar.js')
    const h = renderFKeyBar({ keys: { F1: { label: 'Help', action: vi.fn() } } })
    expect(process.stdout.write).toHaveBeenCalled()
    h.stop()
  })

  it('includes bound key labels', async () => {
    const { renderFKeyBar } = await import('../fkeybar.js')
    renderFKeyBar({ keys: { F1: { label: 'Help', action: vi.fn() }, F10: { label: 'Quit', action: vi.fn() } } })
    expect(output()).toContain('Help')
    expect(output()).toContain('Quit')
  })

  it('includes F-key identifiers', async () => {
    const { renderFKeyBar } = await import('../fkeybar.js')
    renderFKeyBar({ keys: { F2: { label: 'Clear Cache', action: vi.fn() } } })
    expect(output()).toContain('F2')
  })

  it('positions bar at last row', async () => {
    const { renderFKeyBar } = await import('../fkeybar.js')
    renderFKeyBar({ keys: {} })
    expect(output()).toContain('\x1b[30;')
  })

  it('setKeys re-renders bar with new keys', async () => {
    const { renderFKeyBar } = await import('../fkeybar.js')
    const h = renderFKeyBar({ keys: { F1: { label: 'Old', action: vi.fn() } } })
    ;(process.stdout.write as ReturnType<typeof vi.fn>).mockClear()
    h.setKeys({ F5: { label: 'New Action', action: vi.fn() } })
    expect(output()).toContain('New Action')
    expect(output()).not.toContain('Old')
    h.stop()
  })

  it('notify shows a temporary message', async () => {
    vi.useFakeTimers()
    const { renderFKeyBar } = await import('../fkeybar.js')
    const h = renderFKeyBar({ keys: {} })
    ;(process.stdout.write as ReturnType<typeof vi.fn>).mockClear()
    h.notify('Done!', 1000)
    expect(output()).toContain('Done!')
    vi.advanceTimersByTime(1001)
    vi.useRealTimers()
    h.stop()
  })

  it('stop removes resize listener', async () => {
    const { renderFKeyBar } = await import('../fkeybar.js')
    const removeSpy = vi.spyOn(process.stdout, 'removeListener')
    const h = renderFKeyBar({ keys: {} })
    h.stop()
    expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function))
  })

  it('does not render undefined keys', async () => {
    const { renderFKeyBar } = await import('../fkeybar.js')
    const keys: FKeyMap = { F1: { label: 'Only', action: vi.fn() } }
    renderFKeyBar({ keys })
    // F2 through F12 are undefined — bar should not contain undefined text
    expect(output()).not.toContain('undefined')
  })
})
```

### NOW generate: src/fkeybar.ts

- Export `function renderFKeyBar({ keys }: { keys: FKeyMap }): FKeyBarHandle`
- `FKeyBarHandle` has `setKeys`, `notify`, `stop`
- `setKeys(keys)` replaces active keys and immediately re-renders the bar
- Cursor to last row: `\x1b[${rows};0H`
- Dark background `\x1b[48;5;236m`, F-key label in bright cyan `\x1b[96m`, key name in white `\x1b[97m`
- `notify(msg, duration?)` replaces bar for `duration` ms then restores
- Re-render on resize event
- `stop()` removes resize listener, shows cursor `\x1b[?25h`
- Hide cursor on init `\x1b[?25l`
- Truncate gracefully at terminal width

---

## Section 5 — src/keyhandler.ts (TDD)

### WRITE THIS TEST FILE FIRST: src/__tests__/keyhandler.test.ts

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'

let mockStdin: EventEmitter & { setRawMode: ReturnType<typeof vi.fn>; resume: ReturnType<typeof vi.fn> }

beforeEach(() => {
  mockStdin = Object.assign(new EventEmitter(), { setRawMode: vi.fn(), resume: vi.fn() })
  vi.spyOn(process, 'stdin', 'get').mockReturnValue(mockStdin as unknown as typeof process.stdin)
})

afterEach(() => { vi.restoreAllMocks() })

describe('startKeyHandler', () => {
  it('sets raw mode on start', async () => {
    const { startKeyHandler } = await import('../keyhandler.js')
    const h = startKeyHandler({ onKey: vi.fn() })
    expect(mockStdin.setRawMode).toHaveBeenCalledWith(true)
    h.stop()
  })

  it('restores raw mode on stop', async () => {
    const { startKeyHandler } = await import('../keyhandler.js')
    const h = startKeyHandler({ onKey: vi.fn() })
    h.stop()
    expect(mockStdin.setRawMode).toHaveBeenCalledWith(false)
  })

  it('calls onKey with the raw key string for each keypress', async () => {
    const onKey = vi.fn()
    const { startKeyHandler } = await import('../keyhandler.js')
    const h = startKeyHandler({ onKey })
    mockStdin.emit('data', Buffer.from('\x1bOP'))
    await vi.waitFor(() => expect(onKey).toHaveBeenCalledWith('\x1bOP'))
    h.stop()
  })

  it('calls onKey for single letter keys', async () => {
    const onKey = vi.fn()
    const { startKeyHandler } = await import('../keyhandler.js')
    const h = startKeyHandler({ onKey })
    mockStdin.emit('data', Buffer.from('g'))
    await vi.waitFor(() => expect(onKey).toHaveBeenCalledWith('g'))
    h.stop()
  })

  it('calls onKey for ESC', async () => {
    const onKey = vi.fn()
    const { startKeyHandler } = await import('../keyhandler.js')
    const h = startKeyHandler({ onKey })
    mockStdin.emit('data', Buffer.from('\x1b'))
    await vi.waitFor(() => expect(onKey).toHaveBeenCalledWith('\x1b'))
    h.stop()
  })

  it('calls onKey for Ctrl+C', async () => {
    const onKey = vi.fn()
    const { startKeyHandler } = await import('../keyhandler.js')
    const h = startKeyHandler({ onKey })
    mockStdin.emit('data', Buffer.from('\x03'))
    await vi.waitFor(() => expect(onKey).toHaveBeenCalledWith('\x03'))
    h.stop()
  })

  it('stop removes the data listener', async () => {
    const removeSpy = vi.spyOn(mockStdin, 'removeListener')
    const { startKeyHandler } = await import('../keyhandler.js')
    const h = startKeyHandler({ onKey: vi.fn() })
    h.stop()
    expect(removeSpy).toHaveBeenCalledWith('data', expect.any(Function))
  })
})
```

### NOW generate: src/keyhandler.ts

Note: `keyhandler.ts` is now a **dumb forwarder** — it sets raw mode and emits raw key strings to `onKey`. All routing logic lives in `router.ts`. This separation makes both modules independently testable.

- Export `function startKeyHandler({ onKey }: { onKey: (key: string) => void }): KeyHandlerHandle`
- Set raw mode true on start, false on stop
- `process.stdin.resume()` on start
- Emit raw key string from each stdin data event: `onKey(buffer.toString())`
- Remove listener and restore raw mode on `stop()`
- No routing logic here — just raw key forwarding

---

## Section 6 — src/server.ts (TDD)

### WRITE THIS TEST FILE FIRST: src/__tests__/server.test.ts

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { startServer } from '../server.js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fetch } from 'node:undici'

const handles: Array<{ close: () => Promise<void> }> = []
afterEach(async () => { await Promise.all(handles.map((h) => h.close())); handles.length = 0 })

function tmpDir(): string {
  const d = join(tmpdir(), `tuimon-${Date.now()}`)
  mkdirSync(d, { recursive: true })
  return d
}

describe('startServer', () => {
  it('returns a localhost URL', async () => {
    const dir = tmpDir()
    writeFileSync(join(dir, 'overview.html'), '<html></html>')
    const h = await startServer({ rootDir: dir })
    handles.push(h)
    expect(h.url).toMatch(/^http:\/\/localhost:\d+$/)
  })

  it('serves HTML files by name', async () => {
    const dir = tmpDir()
    writeFileSync(join(dir, 'overview.html'), '<html><body>Overview</body></html>')
    const h = await startServer({ rootDir: dir })
    handles.push(h)
    const text = await (await fetch(h.urlFor('overview.html'))).text()
    expect(text).toContain('Overview')
  })

  it('injects tuimon client script if not present', async () => {
    const dir = tmpDir()
    writeFileSync(join(dir, 'page.html'), '<html><head></head><body></body></html>')
    const h = await startServer({ rootDir: dir })
    handles.push(h)
    const text = await (await fetch(h.urlFor('page.html'))).text()
    expect(text).toContain('/tuimon/client.js')
  })

  it('does not double-inject the client script', async () => {
    const dir = tmpDir()
    writeFileSync(join(dir, 'page.html'), '<html><head><script src="/tuimon/client.js"></script></head></html>')
    const h = await startServer({ rootDir: dir })
    handles.push(h)
    const text = await (await fetch(h.urlFor('page.html'))).text()
    expect((text.match(/tuimon\/client\.js/g) ?? []).length).toBe(1)
  })

  it('serves /tuimon/client.js', async () => {
    const dir = tmpDir()
    const h = await startServer({ rootDir: dir })
    handles.push(h)
    const res = await fetch(h.url + '/tuimon/client.js')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('TuiMon')
  })

  it('serves static assets from rootDir', async () => {
    const dir = tmpDir()
    writeFileSync(join(dir, 'app.css'), 'body{color:red}')
    const h = await startServer({ rootDir: dir })
    handles.push(h)
    const res = await fetch(h.url + '/app.css')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('color:red')
  })

  it('serves the internal confirm-quit page at /tuimon/confirm-quit.html', async () => {
    const dir = tmpDir()
    const h = await startServer({ rootDir: dir })
    handles.push(h)
    const res = await fetch(h.url + '/tuimon/confirm-quit.html')
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text.toLowerCase()).toContain('quit')
  })

  it('returns 404 for unknown paths', async () => {
    const dir = tmpDir()
    const h = await startServer({ rootDir: dir })
    handles.push(h)
    expect((await fetch(h.url + '/nope.xyz')).status).toBe(404)
  })

  it('urlFor returns correct URL for a page file', async () => {
    const dir = tmpDir()
    writeFileSync(join(dir, 'cpu.html'), '<html></html>')
    const h = await startServer({ rootDir: dir })
    handles.push(h)
    expect(h.urlFor('cpu.html')).toMatch(/\/cpu\.html$/)
  })

  it('stops after close()', async () => {
    const dir = tmpDir()
    const h = await startServer({ rootDir: dir })
    const { url } = h
    await h.close()
    await expect(fetch(url)).rejects.toThrow()
  })
})
```

### NOW generate: src/server.ts

Key change from original design: the server now takes a `rootDir` instead of a single `html` path. This is because TuiMon now serves multiple page HTML files from the same directory tree.

- Export `async function startServer({ rootDir }: { rootDir: string }): Promise<ServerHandle>`
- `node:http` only — no Express
- Inject `<script src="/tuimon/client.js"></script>` before `</head>` if absent
- `/tuimon/client.js` → serve `client/tuimon-client.js` from package root
- `/tuimon/confirm-quit.html` → serve `templates/internal/confirm-quit.html` from package root
- All other paths → serve from `rootDir`
- `urlFor(filename)` → `${url}/${filename}`
- Try ports starting at 7337
- Correct MIME types for html/css/js/json/png/jpg/svg/woff2

---

## Section 7 — src/encoder.ts (TDD)

### WRITE THIS TEST FILE FIRST: src/__tests__/encoder.test.ts

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { encodeAndRender } from '../encoder.js'

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI6QAAAABJRU5ErkJggg==',
  'base64'
)

beforeEach(() => { vi.spyOn(process.stdout, 'write').mockImplementation(() => true) })
afterEach(() => { vi.restoreAllMocks() })

function output(): string {
  return (process.stdout.write as ReturnType<typeof vi.fn>).mock.calls
    .map((c) => c[0] instanceof Buffer ? c[0].toString('binary') : c[0] as string)
    .join('')
}

describe('kitty protocol', () => {
  it('writes to stdout', async () => {
    await encodeAndRender(TINY_PNG, { protocol: 'kitty' })
    expect(process.stdout.write).toHaveBeenCalled()
  })

  it('starts with cursor home', async () => {
    await encodeAndRender(TINY_PNG, { protocol: 'kitty' })
    const first = (process.stdout.write as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    expect((first instanceof Buffer ? first.toString() : first as string)).toContain('\x1b[H')
  })

  it('contains Kitty APC header', async () => {
    await encodeAndRender(TINY_PNG, { protocol: 'kitty' })
    expect(output()).toContain('\x1b_G')
  })

  it('contains a=T action flag', async () => {
    await encodeAndRender(TINY_PNG, { protocol: 'kitty' })
    expect(output()).toMatch(/a=T/)
  })

  it('contains Kitty string terminator', async () => {
    await encodeAndRender(TINY_PNG, { protocol: 'kitty' })
    expect(output()).toContain('\x1b\\')
  })

  it('uses m=1 for large images requiring multiple chunks', async () => {
    await encodeAndRender(Buffer.alloc(100 * 1024, 0xff), { protocol: 'kitty' })
    expect(output()).toContain('m=1')
  })

  it('completes within 150ms for a small image', async () => {
    const start = Date.now()
    await encodeAndRender(TINY_PNG, { protocol: 'kitty' })
    expect(Date.now() - start).toBeLessThan(150)
  })
})

describe('sixel protocol', () => {
  it('writes to stdout', async () => {
    await encodeAndRender(TINY_PNG, { protocol: 'sixel' })
    expect(process.stdout.write).toHaveBeenCalled()
  })

  it('contains DCS sixel header', async () => {
    await encodeAndRender(TINY_PNG, { protocol: 'sixel' })
    expect(output()).toMatch(/\x1bP[^q]*q/)
  })

  it('contains sixel string terminator', async () => {
    await encodeAndRender(TINY_PNG, { protocol: 'sixel' })
    expect(output()).toContain('\x1b\\')
  })
})
```

### NOW generate: src/encoder.ts

- Export `async function encodeAndRender(buffer: Buffer, opts: { protocol: 'kitty' | 'sixel' }): Promise<void>`
- Sharp warm-up on module load
- Kitty: cursor home → DEC 2026 open → base64 PNG in 4096-byte chunks → DEC 2026 close
- Sixel: sharp 256-color → raw pixels → DCS header + palette + sixel rows + ST
- All tests must pass before proceeding

---

## Section 8 — src/browser.ts (TDD)

### WRITE THIS TEST FILE FIRST: src/__tests__/browser.test.ts

```ts
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
```

### NOW generate: src/browser.ts

- Export `async function createBrowser({ url, width, height }): Promise<BrowserHandle>`
- `navigate(url)` → `page.goto(url, { waitUntil: 'domcontentloaded' })`
- `pushData(data)` → `page.evaluate` then `page.waitForFunction(() => window.__tuimon_ready__, { timeout: 2000 })`
- `page.on('crash')` → log + reload
- `page.on('pageerror')` → log to stderr

---

## Section 9 — src/index.ts (TDD)

### WRITE THIS TEST FILE FIRST: src/__tests__/index.test.ts

```ts
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
vi.mock('../fkeybar.js', () => ({ renderFKeyBar: vi.fn().mockReturnValue({ setKeys: vi.fn(), notify: vi.fn(), stop: vi.fn() }) }))
vi.mock('../router.js', () => ({
  createRouter: vi.fn().mockReturnValue({
    handleKey: vi.fn().mockResolvedValue(undefined),
    getState: vi.fn().mockReturnValue({ type: 'overview', pageId: 'overview' }),
  }),
}))

const testOptions = {
  pages: {
    overview: { html: './pages/overview.html', default: true, keys: {} },
  },
}

beforeEach(() => { vi.clearAllMocks() })

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
```

### NOW generate: src/index.ts

- Default export `{ start(options: TuiMonOptions): Promise<TuiMonDashboard> }`
- Startup sequence: validate options → detect → server → browser → router → keyhandler → fkeybar
- Enter alt screen + hide cursor: `\x1b[?1049h\x1b[?25l`
- Restore on stop: `\x1b[?25h\x1b[?1049l`
- `render(data)` caches data in `lastData`, then: pushData → screenshot → encodeAndRender
- `stop()`: keyhandler → fkeybar → browser → server → restore terminal
- Wire `startKeyHandler({ onKey: router.handleKey })` — keyhandler forwards all keys to router
- Router gets `navigate`, `render`, `setKeys` as dependencies injected from index
- Browser viewport height = `pixelHeight - cellPixelHeight` (reserve 1 row for F-key bar)
- Determine `cellPixelHeight` = `Math.floor(pixelHeight / rows)`
- Resolve all page html paths via `path.resolve(process.cwd(), page.html)`
- Derive `rootDir` as the common parent directory of all page html files
- If `refresh` + `data` provided: `setInterval(async () => render(await data()), refresh)`
- `process.once('SIGINT', stop)` and `process.once('exit', stop)` — call stop exactly once
- All tests must pass before proceeding

---

## Section 10 — client/tuimon-client.js

Plain JS. No build step. Runs in browser context.

```js
;(function () {
  'use strict'

  window.__tuimon_ready__ = false

  window.__tuimon_update__ = function (data) {
    window.__tuimon_ready__ = false
    window.dispatchEvent(new CustomEvent('tuimon:update', { detail: data }))
    window.__tuimon_ready__ = true
  }

  window.TuiMon = {
    onUpdate(callback) {
      window.addEventListener('tuimon:update', (e) => callback(e.detail))
    },

    set(selector, value) {
      const el = document.querySelector(selector)
      if (!el) return
      if (typeof value === 'string') el.textContent = value
      else if (typeof value === 'number') el.textContent = value.toLocaleString()
      else if (typeof value === 'object' && value !== null) Object.assign(el.style, value)
    },

    notify(message, duration = 2000) {
      window.dispatchEvent(new CustomEvent('tuimon:notify', { detail: { message, duration } }))
    },
  }
})()
```

---

## Section 11 — templates/internal/confirm-quit.html

Built into the TuiMon package. Never edited by the developer.

Design:
- Full viewport, dark semi-transparent overlay `rgba(0,0,0,0.85)`
- Centered card: background `#1c2128`, border `#30363d`, border-radius 8px, padding generous
- Title: "Quit TuiMon?" in white, large, clear
- Subtitle: "Press Y to confirm or N to cancel" in muted grey
- Two styled key indicators: `[Y]` in red, `[N]` in green
- ESC note: "ESC also cancels" in small muted text
- No JavaScript needed — it is a static display. The router handles Y/N/ESC.
- Looks intentional and polished — not a debug screen

---

## Section 12 — Starter Template

### templates/starter/pages/overview.html

Professional monitoring overview with:
- 4 stat cards top row: CPU%, Memory%, Requests/s, Uptime
- CPU line chart (Chart.js, last 60 points)
- Memory doughnut chart
- Request rate bar chart
- Log panel bottom
- Panel borders with `data-tm-key` and `data-tm-label` attributes on chart panels:
  ```html
  <div class="tm-panel" data-tm-key="g" data-tm-label="CPU Detail">
  ```
- TuiMon client JS reads `data-tm-key` and injects a small `[G]` badge in the top-right
  corner of each panel automatically — developer just adds the data attributes

### templates/starter/pages/cpu-detail.html

Full-screen CPU deep dive:
- Large real-time line chart taking 70% of the screen
- Sidebar with: core count, load averages, top processes (fake data), per-core bars
- Shows the last 5 minutes of history
- Different layout to overview — proves that pages can look completely different

### templates/starter/pages/memory-detail.html

Full-screen memory deep dive:
- Large doughnut showing used/free/cached
- Timeline of memory usage
- Heap stats if applicable
- Different color palette to CPU page

### templates/starter/tuimon.config.ts

```ts
import tuimon from 'tuimon'
import { cpus, freemem, totalmem, loadavg } from 'node:os'

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
```

---

## Section 13 — src/cli.ts

No unit tests. Verify manually after build.

Commands:
- `tuimon start [--config path]` — dynamic import config, call start
- `tuimon init` — scaffold starter into cwd, confirm before overwrite
- `tuimon check` — detectGraphicsSupport + formatted report, exit 0/1

`tuimon check` output:
```
TuiMon Terminal Check
─────────────────────
Kitty protocol:  ✓ supported
Sixel protocol:  ✗ not detected
iTerm2 protocol: ✗ not detected

✓ Will use: kitty
  Ghostty 1.0.1
```

---

## Section 14 — README.md

Complete README covering:
1. One-line tagline
2. Terminal requirements table (Kitty ✓, Ghostty ✓, WezTerm ✓, iTerm2 ✓, VSCode ✓*)
3. Quick start — 4 commands
4. How it works — 3 sentences
5. Multi-page navigation — shortcut keys, panel data attributes, ESC behaviour
6. Per-page F-key bindings — config example with types
7. Quit confirmation — ESC on overview, Ctrl+C bypass
8. Full API reference with TypeScript types
9. Client library — onUpdate, set, notify
10. Panel shortcut badges — data-tm-key, data-tm-label
11. Using template engines / existing servers
12. Contributing — TDD required, coverage thresholds
13. MIT License

---

## Implementation Rules

1. **Tests first, always.** Write the test file. Run it. See it fail. Then implement.
2. **No `any`.** Use `unknown` with guards or proper generics everywhere.
3. **All async errors handled.** Every `await` that can throw is caught.
4. **Terminal always restored.** On any exit path — cursor shown, alt screen off, raw mode off.
5. **ESC and Ctrl+C are sacred.** They cannot be overridden by developer config. Ever.
6. **No `process.exit` in library code.** Only router (Ctrl+C, Y confirm) and user key actions call it.
7. **Dependency injection for testability.** stdin/stdout/process passed as params with defaults.
8. **Coverage gates enforced.** `npm run test:coverage` must pass thresholds before each section is done.
9. **One concern per file.** keyhandler forwards keys. router routes them. They do not cross.
10. **The starter template must impress.** It is the product demo. It ships three full pages.
11. **Router tests are the most important tests in the project.** Every state transition has a test.
