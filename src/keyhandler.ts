import type { KeyHandlerHandle } from './types.js'

export function startKeyHandler({ onKey }: { onKey: (key: string) => void }): KeyHandlerHandle {
  const onData = (buffer: Buffer): void => {
    onKey(buffer.toString())
  }

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true)
  }
  process.stdin.resume()
  process.stdin.on('data', onData)

  return {
    stop(): void {
      process.stdin.removeListener('data', onData)
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false)
      }
      process.stdin.pause()
    },
  }
}
