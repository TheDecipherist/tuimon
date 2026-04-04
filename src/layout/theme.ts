import type { ThemeConfig } from './types.js'

export const DEFAULT_THEME: ThemeConfig = {
  bg: '#0a0e1a',
  panelBg: '#0f1629',
  border: '#00e5ff',
  text: '#e0e6ed',
  textMuted: '#5a6a7a',
  accent: '#00e5ff',
  success: '#00e676',
  warning: '#ffab40',
  danger: '#ff5252',
  purple: '#b388ff',
  chartColors: [
    '#00e5ff', '#ff6e40', '#00e676', '#b388ff',
    '#ffab40', '#ff5252', '#40c4ff', '#69f0ae',
    '#ffd740', '#ff80ab', '#448aff', '#b2ff59',
  ],
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace",
}

export function mergeTheme(overrides?: Partial<ThemeConfig>): ThemeConfig {
  if (!overrides) return { ...DEFAULT_THEME }
  return {
    ...DEFAULT_THEME,
    ...overrides,
    chartColors: overrides.chartColors ? [...overrides.chartColors] : [...DEFAULT_THEME.chartColors],
  }
}
