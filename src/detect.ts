import type { GraphicsSupport, TerminalDimensions } from './types.js'

// ─── Env-based detection helpers ─────────────────────────────────────────────

const KITTY_TERM_PROGRAMS = ['WezTerm', 'ghostty', 'Ghostty']
const ITERM2_TERM_PROGRAMS = ['iTerm.app', 'iTerm2']

function detectKittyEnv(): boolean {
  const term = process.env.TERM ?? ''
  const termProgram = process.env.TERM_PROGRAM ?? ''
  if (term === 'xterm-kitty') return true
  if (KITTY_TERM_PROGRAMS.includes(termProgram)) return true
  return false
}

function detectIterm2Env(): boolean {
  const termProgram = process.env.TERM_PROGRAM ?? ''
  return ITERM2_TERM_PROGRAMS.includes(termProgram)
}

function detectSixelEnv(): boolean {
  const term = process.env.TERM ?? ''
  const termProgram = process.env.TERM_PROGRAM ?? ''
  if (term === 'mlterm') return true
  if (termProgram === 'vscode') return true
  return false
}

// ─── Terminal query helpers ──────────────────────────────────────────────────

function queryKittySupport(): Promise<boolean> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      cleanup()
      resolve(false)
    }, 500)

    const onData = (data: Buffer) => {
      const str = data.toString()
      if (str.includes('_G')) {
        cleanup()
        resolve(true)
      }
    }

    const cleanup = () => {
      clearTimeout(timeout)
      process.stdin.removeListener('data', onData)
      if (wasRaw !== undefined) {
        try { process.stdin.setRawMode(wasRaw) } catch {}
      }
    }

    let wasRaw: boolean | undefined
    try {
      wasRaw = process.stdin.isRaw
      process.stdin.setRawMode(true)
    } catch {}

    process.stdin.on('data', onData)
    process.stdout.write('\x1b_Ga=q;\x1b\\')
  })
}

function queryPixelDimensions(): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      cleanup()
      resolve(null)
    }, 500)

    const onData = (data: Buffer) => {
      const str = data.toString()
      // Response format: \x1b[4;<height>;<width>t
      const match = str.match(/\x1b\[4;(\d+);(\d+)t/)
      if (match) {
        cleanup()
        resolve({ width: parseInt(match[2] ?? '0', 10), height: parseInt(match[1] ?? '0', 10) })
      }
    }

    const cleanup = () => {
      clearTimeout(timeout)
      process.stdin.removeListener('data', onData)
      if (wasRaw !== undefined) {
        try { process.stdin.setRawMode(wasRaw) } catch {}
      }
    }

    let wasRaw: boolean | undefined
    try {
      wasRaw = process.stdin.isRaw
      process.stdin.setRawMode(true)
    } catch {}

    process.stdin.on('data', onData)
    process.stdout.write('\x1b[14t')
  })
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function detectGraphicsSupport(
  opts?: { skipQuery?: boolean },
): Promise<GraphicsSupport> {
  const skipQuery = opts?.skipQuery ?? false

  // Start with environment-based detection
  let kitty = detectKittyEnv()
  const iterm2 = detectIterm2Env()
  const sixel = detectSixelEnv()

  // If not skipping queries and env didn't detect kitty, try querying
  if (!skipQuery && !kitty) {
    kitty = await queryKittySupport()
  }

  // Determine protocol with priority: kitty > iterm2 > sixel
  let protocol: GraphicsSupport['protocol'] = null
  if (kitty) {
    protocol = 'kitty'
  } else if (iterm2) {
    protocol = 'iterm2'
  } else if (sixel) {
    protocol = 'sixel'
  }

  return { kitty, sixel, iterm2, protocol }
}

export async function getTerminalDimensions(
  opts?: { skipQuery?: boolean },
): Promise<TerminalDimensions> {
  const skipQuery = opts?.skipQuery ?? false

  const cols = process.stdout.columns ?? 80
  const rows = process.stdout.rows ?? 24

  let pixelWidth = 1600
  let pixelHeight = 900

  if (!skipQuery) {
    const queried = await queryPixelDimensions()
    if (queried) {
      pixelWidth = queried.width
      pixelHeight = queried.height
    }
  }

  return { cols, rows, pixelWidth, pixelHeight }
}
