# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run build          # tsc → dist/
npm run dev            # tsc --watch
npm test               # vitest run (single pass)
npm run test:watch     # vitest (watch mode)
npm run test:coverage  # vitest run --coverage
npm run typecheck      # tsc --noEmit
npm run lint           # eslint src --ext .ts
npm run format         # prettier --write src
```

Run a single test file: `npx vitest run src/__tests__/router.test.ts`
Run tests matching a pattern: `npx vitest run --grep "shortcut navigation"`

## Architecture

TuiMon renders HTML pages in a headless Chromium browser, screenshots them as PNG, and streams images to the terminal via Kitty/Sixel graphics protocols. Developers write dashboards as plain HTML/CSS/JS.

### Startup Sequence (src/index.ts)

`tuimon.start(options)` orchestrates everything in this order:

1. **detect.ts** — probe terminal for Kitty/Sixel/iTerm2 support and pixel dimensions
2. **server.ts** — spin up an HTTP server on localhost:7337+ serving HTML pages from a common root directory
3. **browser.ts** — launch headless Chromium via Playwright, set viewport to terminal pixel dimensions
4. **router.ts** — create navigation state machine wired to navigate/render/setKeys callbacks
5. **keyhandler.ts** — enable stdin raw mode, forward raw key strings to router.handleKey
6. **fkeybar.ts** — render F-key status bar on the terminal's last row

### Render Pipeline

```
dash.render(data) → browser.pushData(data) → page.__tuimon_update__(data)
  → setTimeout(renderDelay) → browser.screenshot() → encodeAndRender(png, protocol)
```

The encoder writes directly to stdout: Kitty uses base64 PNG chunked at 4096 bytes; Sixel uses sharp to convert to raw pixels then builds sixel bands.

### Router State Machine (src/router.ts)

Three states: `overview` → `detail` → `confirm-quit`. This is the navigation core:
- **overview**: shortcut keys navigate to detail pages; ESC opens confirm-quit
- **detail**: ESC returns to overview; shortcuts ignored
- **confirm-quit**: Y exits, N/ESC returns to previous state; all F-keys ignored
- **Ctrl+C**: immediate exit from any state

F-key escape sequences are mapped in a lookup table (e.g., `\x1bOP` → F1, `\x1b[15~` → F5).

### Client Bridge (client/tuimon-client.js)

Auto-injected into served HTML pages by the server. Exposes `window.TuiMon.onUpdate(cb)` and `window.TuiMon.set(selector, value)`. Data attributes `data-tm-key` and `data-tm-label` on HTML elements get automatic shortcut badges.

## TypeScript Rules

- **Strict mode** with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns`
- **ESM only** — module: NodeNext, all imports use `.js` extension
- All shared interfaces live in `src/types.ts` — modules import types from there
- iterm2 protocol maps to kitty for encoding (only 'kitty' | 'sixel' reach the encoder)

## Testing Patterns

Tests live in `src/__tests__/`. Setup file (`setup.ts`) converts `process.stdout.columns/rows` to getter properties for `vi.spyOn` compatibility.

- **Module mocking**: `vi.mock('../module.js', () => ({ ... }))` at file top
- **Dynamic imports**: tests use `await import('../module.js')` after `vi.resetModules()` for env-dependent modules (detect, router)
- **stdout capture**: `vi.spyOn(process.stdout, 'write').mockImplementation(() => true)` then collect calls
- **stdin simulation**: create `EventEmitter` with `setRawMode`/`resume` stubs, mock `process.stdin`
- **Server tests**: create real temp directories with `mkdirSync`, track handles for cleanup in `afterEach`

Coverage thresholds: 80% lines/functions/statements, 75% branches. cli.ts is excluded.

## Formatting

No semicolons, single quotes, trailing commas, 100 char width, 2-space indent (see .prettierrc).
