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
