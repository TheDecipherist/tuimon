import { describe, it, expect, afterEach } from 'vitest'
import { startServer } from '../server.js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const handles: Array<{ close: () => Promise<void> }> = []
afterEach(async () => { await Promise.all(handles.map((h) => h.close())); handles.length = 0 })

function tmpDir(): string {
  const d = join(tmpdir(), `tuimon-${Date.now()}-${Math.random().toString(36).slice(2)}`)
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
