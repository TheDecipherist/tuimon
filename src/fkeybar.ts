import type { FKey, FKeyMap, FKeyBarHandle } from './types.js'

const ALL_FKEYS = ['F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12'] as const

const BG = '\x1b[48;5;236m'
const CYAN = '\x1b[96m'
const WHITE = '\x1b[97m'
const RESET = '\x1b[0m'
const HIDE_CURSOR = '\x1b[?25l'
const SHOW_CURSOR = '\x1b[?25h'

function buildBar(keys: FKeyMap, cols: number): string {
  const segments: string[] = []

  for (const fk of ALL_FKEYS) {
    const binding = keys[fk as FKey]
    if (!binding) continue
    segments.push(`${CYAN}${fk}${WHITE} ${binding.label}`)
  }

  const plain = segments
    .map((_, i) => {
      const fk = ALL_FKEYS.find((k) => keys[k as FKey])
      // recalculate without ansi for length
      return ''
    })
    .join('')

  // Build the full rendered line
  let rendered = segments.join('  ')

  // Calculate visible length (strip ANSI)
  const visibleLength = rendered.replace(/\x1b\[[0-9;]*m/g, '').length

  if (visibleLength > cols) {
    // Truncate: rebuild with fewer segments
    rendered = ''
    let currentLen = 0
    for (let i = 0; i < segments.length; i++) {
      const segVisible = (segments[i] ?? '').replace(/\x1b\[[0-9;]*m/g, '').length
      const sepLen = rendered.length > 0 ? 2 : 0
      if (currentLen + segVisible + sepLen > cols) break
      rendered += (rendered.length > 0 ? '  ' : '') + (segments[i] ?? '')
      currentLen += segVisible + sepLen
    }
  }

  // Pad to full width
  const finalVisible = rendered.replace(/\x1b\[[0-9;]*m/g, '').length
  const padding = Math.max(0, cols - finalVisible)

  return `${BG}${rendered}${' '.repeat(padding)}${RESET}`
}

function renderLine(content: string, rows: number): void {
  process.stdout.write(`\x1b[${rows};0H${content}`)
}

export function renderFKeyBar({ keys }: { keys: FKeyMap }): FKeyBarHandle {
  let currentKeys = keys
  let notifyTimer: ReturnType<typeof setTimeout> | null = null

  process.stdout.write(HIDE_CURSOR)

  function draw(): void {
    const cols = process.stdout.columns || 80
    const rows = process.stdout.rows || 24
    const bar = buildBar(currentKeys, cols)
    renderLine(bar, rows)
  }

  function onResize(): void {
    draw()
  }

  process.stdout.on('resize', onResize)
  draw()

  return {
    setKeys(newKeys: FKeyMap): void {
      currentKeys = newKeys
      if (notifyTimer) {
        clearTimeout(notifyTimer)
        notifyTimer = null
      }
      draw()
    },

    notify(message: string, duration = 3000): void {
      const cols = process.stdout.columns || 80
      const rows = process.stdout.rows || 24
      const visible = message.slice(0, cols)
      const padding = Math.max(0, cols - visible.length)
      const line = `${BG}${WHITE}${visible}${' '.repeat(padding)}${RESET}`
      renderLine(line, rows)

      if (notifyTimer) clearTimeout(notifyTimer)
      notifyTimer = setTimeout(() => {
        notifyTimer = null
        draw()
      }, duration)
    },

    stop(): void {
      if (notifyTimer) {
        clearTimeout(notifyTimer)
        notifyTimer = null
      }
      process.stdout.removeListener('resize', onResize)
      process.stdout.write(SHOW_CURSOR)
    },
  }
}
