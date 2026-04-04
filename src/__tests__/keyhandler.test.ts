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
