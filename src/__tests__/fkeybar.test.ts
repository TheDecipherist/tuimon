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
    expect(output()).not.toContain('undefined')
  })
})
