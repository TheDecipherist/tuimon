import type { KeyHandlerHandle } from './types.js'

export function startKeyHandler({ onKey }: { onKey: (key: string) => void }): KeyHandlerHandle {
  const onData = (buffer: Buffer): void => {
    onKey(buffer.toString())
  }

  process.stdin.setRawMode(true)
  process.stdin.resume()
  process.stdin.on('data', onData)

  return {
    stop(): void {
      process.stdin.removeListener('data', onData)
      process.stdin.setRawMode(false)
    },
  }
}
