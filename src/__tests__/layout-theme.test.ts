import { describe, it, expect } from 'vitest'
import { DEFAULT_THEME, mergeTheme } from '../layout/theme.js'

describe('DEFAULT_THEME', () => {
  it('has all required fields', () => {
    expect(DEFAULT_THEME.bg).toBeDefined()
    expect(DEFAULT_THEME.panelBg).toBeDefined()
    expect(DEFAULT_THEME.border).toBeDefined()
    expect(DEFAULT_THEME.text).toBeDefined()
    expect(DEFAULT_THEME.textMuted).toBeDefined()
    expect(DEFAULT_THEME.accent).toBeDefined()
    expect(DEFAULT_THEME.success).toBeDefined()
    expect(DEFAULT_THEME.warning).toBeDefined()
    expect(DEFAULT_THEME.danger).toBeDefined()
    expect(DEFAULT_THEME.purple).toBeDefined()
    expect(DEFAULT_THEME.chartColors).toBeInstanceOf(Array)
    expect(DEFAULT_THEME.chartColors.length).toBeGreaterThanOrEqual(6)
    expect(DEFAULT_THEME.fontFamily).toBeDefined()
  })

  it('uses the dark neon color scheme', () => {
    expect(DEFAULT_THEME.bg).toBe('#0a0e1a')
    expect(DEFAULT_THEME.accent).toBe('#00e5ff')
    expect(DEFAULT_THEME.border).toBe('#00e5ff')
  })
})

describe('mergeTheme', () => {
  it('returns a copy of DEFAULT_THEME when no overrides', () => {
    const theme = mergeTheme()
    expect(theme).toEqual(DEFAULT_THEME)
    expect(theme).not.toBe(DEFAULT_THEME)
  })

  it('returns a copy of DEFAULT_THEME when undefined', () => {
    const theme = mergeTheme(undefined)
    expect(theme).toEqual(DEFAULT_THEME)
  })

  it('overrides individual color fields', () => {
    const theme = mergeTheme({ bg: '#111111', accent: '#ff0000' })
    expect(theme.bg).toBe('#111111')
    expect(theme.accent).toBe('#ff0000')
    expect(theme.panelBg).toBe(DEFAULT_THEME.panelBg)
  })

  it('overrides chartColors entirely when provided', () => {
    const custom = ['#aaa', '#bbb']
    const theme = mergeTheme({ chartColors: custom })
    expect(theme.chartColors).toEqual(custom)
    expect(theme.chartColors).not.toBe(custom) // must be a copy
  })

  it('preserves default chartColors when not overridden', () => {
    const theme = mergeTheme({ bg: '#000' })
    expect(theme.chartColors).toEqual(DEFAULT_THEME.chartColors)
    expect(theme.chartColors).not.toBe(DEFAULT_THEME.chartColors) // must be a copy
  })
})
