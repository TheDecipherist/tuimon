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
  /** Absolute or cwd-relative path to the HTML file for this page.
   *  Required unless `layout` is provided — layout pages generate HTML automatically. */
  html: string // Set automatically if layout is provided
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
  /** Declarative layout config — if provided, TuiMon generates the HTML automatically.
   *  Cannot be used together with `html` on the same page. */
  layout?: import('./layout/types.js').LayoutConfig
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
  refresh?: number | undefined
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
  evaluate: (expression: string) => Promise<void>
  close: () => Promise<void>
}

export interface FKeyBarHandle {
  /** Replace the current key set and re-render the bar */
  setKeys: (keys: FKeyMap) => void
  /** Show a temporary message in the bar for duration ms */
  notify: (message: string, duration?: number) => void
  /** Force redraw the bar at current position */
  redraw: () => void
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
