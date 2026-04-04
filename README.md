# TuiMon

> Render beautiful HTML dashboards directly in your terminal.

## Terminal Requirements

| Terminal   | Protocol | Status     |
|-----------|----------|------------|
| Kitty     | Kitty    | Supported  |
| Ghostty   | Kitty    | Supported  |
| WezTerm   | Kitty    | Supported  |
| iTerm2    | iTerm2   | Supported  |
| VSCode    | Sixel    | Supported* |
| mlterm    | Sixel    | Supported  |

\* Sixel support may vary by terminal version.

## Quick Start

```bash
npx tuimon init
npx tuimon check
npx tuimon start
```

Or install globally:

```bash
npm install -g tuimon
tuimon init && tuimon start
```

## How It Works

TuiMon renders your HTML pages in a headless Chromium browser via Playwright, screenshots them as PNG, and streams the images to your terminal using the Kitty graphics protocol (or Sixel as fallback). You write dashboards as normal HTML/CSS/JS — any charting library works.

## Multi-Page Navigation

Define multiple pages with keyboard shortcuts:

```typescript
const dash = await tuimon.start({
  pages: {
    overview: {
      html: './pages/overview.html',
      default: true,
      label: 'Overview',
    },
    cpu: {
      html: './pages/cpu-detail.html',
      shortcut: 'g',
      label: 'CPU Detail',
    },
    memory: {
      html: './pages/memory-detail.html',
      shortcut: 'm',
      label: 'Memory',
    },
  },
})
```

- Press a shortcut key from the overview to jump to a detail page
- Press **ESC** on a detail page to return to overview
- Press **ESC** on overview to show quit confirmation
- Press **Ctrl+C** anywhere to exit immediately

Add shortcut badges to HTML panels with data attributes:

```html
<div class="panel" data-tm-key="g" data-tm-label="CPU Detail">
  <!-- panel content -->
</div>
```

## Per-Page F-Key Bindings

Each page defines its own F-key actions:

```typescript
pages: {
  overview: {
    html: './pages/overview.html',
    default: true,
    keys: {
      F5: { label: 'Refresh', action: async () => dash.render(await getData()) },
      F10: { label: 'Quit', action: () => process.exit(0) },
    },
  },
}
```

The F-key bar at the bottom always reflects the active page's bindings.

## API Reference

### `tuimon.start(options: TuiMonOptions): Promise<TuiMonDashboard>`

```typescript
interface TuiMonOptions {
  pages: Record<string, PageConfig>
  data?: () => Record<string, unknown> | Promise<Record<string, unknown>>
  refresh?: number    // auto-render interval in ms
  renderDelay?: number // delay after pushData before screenshot (default: 50)
}

interface PageConfig {
  html: string           // path to HTML file
  default?: boolean      // exactly one page must be default
  shortcut?: string      // single lowercase letter
  label?: string         // human-readable name
  keys?: Partial<Record<FKey, KeyBinding>>
}

interface KeyBinding {
  label: string
  action: () => void | Promise<void>
}
```

### `dash.render(data): Promise<void>`

Push data to the current page and re-render.

### `dash.stop(): Promise<void>`

Gracefully shut down — restores terminal state.

## Client Library

In your HTML pages, use the injected `TuiMon` object:

```javascript
// Listen for data updates
TuiMon.onUpdate(function(data) {
  TuiMon.set('#cpu', data.cpu)
  TuiMon.set('#memory', data.memory + '%')
})

// TuiMon.set(selector, value) — sets text content or applies styles
// TuiMon.notify(message, duration) — dispatches a notification event
```

## Contributing

- **TDD required** — write tests first, implementation second
- Coverage thresholds: 80% lines, 80% functions, 75% branches
- `npm test` must pass before any PR
- Strict TypeScript — `strict: true`, no `any`

## License

MIT
