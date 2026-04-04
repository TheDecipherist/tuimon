// ─── Widget types ────────────────────────────────────────────────────────────

export type WidgetType = 'stat' | 'gauge' | 'line' | 'doughnut' | 'bar' | 'event-log' | 'status-grid'

export interface WidgetConfig {
  /** Data key — dash.render({ [id]: value }) */
  id: string
  /** Display title shown in panel header */
  label: string
  /** Widget visualization type */
  type: WidgetType
  /** Grid column span (default 1) */
  span?: number
  /** Single letter shortcut — shown as [X] badge in panel border */
  shortcut?: string
  /** Label for the shortcut badge */
  shortcutLabel?: string
  /** Minimum ms between updates for this widget. Defaults to global refresh rate. */
  throttle?: number
}

// ─── Layout config ───────────────────────────────────────────────────────────

export interface LayoutConfig {
  /** Dashboard title (top bar) */
  title?: string
  /** Top row stat/gauge cards */
  stats?: WidgetConfig[]
  /** Main grid panels */
  panels?: WidgetConfig[]
  /** Override default theme colors */
  theme?: Partial<ThemeConfig>
}

// ─── Theme ───────────────────────────────────────────────────────────────────

export interface ThemeConfig {
  bg: string
  panelBg: string
  border: string
  text: string
  textMuted: string
  accent: string
  success: string
  warning: string
  danger: string
  purple: string
  chartColors: string[]
  fontFamily: string
}

// ─── Data shapes (detailed format — lazy is normalized to this) ──────────────

export interface StatData {
  value: number | string
  trend?: string
  unit?: string
}

export interface GaugeData {
  value: number
  max?: number
  label?: string
}

export interface LineData {
  series: Array<{ label: string; data: number[] }>
  max?: number
}

export interface EventEntry {
  text: string
  type?: 'info' | 'success' | 'warning' | 'error'
  time?: string
}

export interface StatusEntry {
  label: string
  status: 'ok' | 'warn' | 'error' | 'unknown'
}
