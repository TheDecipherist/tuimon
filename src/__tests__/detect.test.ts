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
