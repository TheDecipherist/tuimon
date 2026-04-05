# TuiMon

> Your HTML, CSS, and JavaScript — rendered directly in the terminal.

## What Is TuiMon?

TuiMon takes any HTML page and renders it in your terminal. Write your dashboard with HTML, CSS flexbox, Chart.js, D3 — whatever you already know — and TuiMon displays it as a live, interactive terminal application. No curses. No blessed. No terminal UI framework. Just web tech you already use.

```
Your HTML/CSS/JS → Headless Chromium → Screenshot → Terminal Graphics Protocol → Terminal
```

You get the full power of the browser rendering engine in your terminal. If it works in a browser, it works in TuiMon.

## Quick Demo

```bash
npm install -g tuimon
tuimon init       # scaffolds a starter dashboard
tuimon start      # renders it in your terminal
```

## Three Ways to Use TuiMon

### 1. Custom HTML Dashboard (The Core)

Write your dashboard as normal HTML. Use CSS flexbox, grid, animations — anything. Use any charting library. TuiMon renders it in your terminal at ~20 FPS.

```html
<!-- pages/dashboard.html -->
<div style="display: flex; gap: 20px; padding: 20px; background: #0a0e1a; color: white; height: 100vh;">
  <div style="flex: 1; background: #0f1629; border-radius: 8px; padding: 16px;">
    <h3>CPU Usage</h3>
    <canvas id="cpuChart"></canvas>
  </div>
  <div style="flex: 1; background: #0f1629; border-radius: 8px; padding: 16px;">
    <h3>Memory</h3>
    <div id="memValue" style="font-size: 48px; color: #00e5ff;">--</div>
  </div>
</div>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<script>
  TuiMon.onUpdate(function(data) {
    TuiMon.set('#memValue', data.memory + '%')
    // update your charts, DOM, anything
  })
</script>
```

```typescript
// tuimon.config.ts
import tuimon from 'tuimon'

const dash = await tuimon.start({
  pages: {
    main: {
      html: './pages/dashboard.html',
      default: true,
      keys: {
        F5: { label: 'Refresh', action: async () => dash.render(await getData()) },
        F10: { label: 'Quit', action: () => process.exit(0) },
      },
    },
  },
  refresh: 1000,
  data: getData,
})
```

**Multi-page navigation:** Define multiple HTML pages with keyboard shortcuts to switch between them. Press a shortcut key to jump to a detail page, ESC to go back.

```typescript
pages: {
  overview: { html: './pages/overview.html', default: true },
  cpu:      { html: './pages/cpu-detail.html', shortcut: 'g', label: 'CPU Detail' },
  memory:   { html: './pages/memory-detail.html', shortcut: 'm', label: 'Memory' },
}
```

**Client library:** TuiMon injects a client script into your HTML pages automatically:
- `TuiMon.onUpdate(callback)` — receive data from `dash.render(data)`
- `TuiMon.set(selector, value)` — update text content or styles
- `TuiMon.notify(message)` — dispatch notification events

**Shortcut badges:** Add `data-tm-key="g"` to any element and TuiMon renders a `[G]` badge in the corner — users know they can press G to navigate there.

### 2. Declarative Dashboard (No HTML Required)

Don't want to write HTML? Define widgets in a config and push data:

```typescript
const dash = await tuimon.start({
  pages: {
    main: {
      default: true,
      layout: {
        title: 'My App',
        stats: [
          { id: 'users', label: 'Users Online', type: 'stat' },
          { id: 'cpu', label: 'CPU', type: 'gauge' },
        ],
        panels: [
          { id: 'traffic', label: 'Traffic', type: 'line', span: 2 },
          { id: 'services', label: 'Services', type: 'doughnut' },
          { id: 'events', label: 'Events', type: 'event-log', throttle: 2000 },
          { id: 'health', label: 'Health', type: 'status-grid', throttle: 5000 },
        ],
      },
    },
  },
  refresh: 500,
  data: () => ({
    users: 42,
    cpu: 73,
    traffic: { Requests: 340, Errors: 12 },
    services: { Web: 47, API: 27 },
    events: ['Deploy completed'],
    health: ['Node-1', 'Node-2'],
  }),
})
```

TuiMon generates a dark neon-themed HTML dashboard from the config. Under the hood, it's still rendering HTML — you just don't have to write it.

**8 widget types:** `stat`, `gauge`, `line`, `doughnut`, `bar`, `event-log`, `status-grid`, `table`

**Lazy data format:** Just send numbers. TuiMon figures out the rest:

| You send | TuiMon shows |
|----------|-------------|
| `42` | Stat card |
| `73` (id contains cpu/mem) | Gauge (0-100%) |
| `{ Requests: 340, Errors: 12 }` | Line chart (auto-accumulates history) |
| `['Deploy completed']` | Event log (auto-timestamped) |
| `['Node-1', 'Node-2']` | Status grid (green dots) |

**Per-widget throttle:** Charts update every frame, event logs every 2s, status grids every 5s — each widget controls its own refresh rate.

### 3. Instant CLI Tools (Zero Setup)

Point TuiMon at any data and get a dashboard instantly:

```bash
# Data files
tuimon data.json                    # JSON → table + charts
tuimon users.csv                    # CSV → table + charts
tuimon access.log                   # Nginx → request stats + browsable table
tuimon modsec_audit.log             # ModSecurity → security dashboard
tuimon data.json -c "name,age"      # Show specific columns

# Live data
tuimon watch metrics.js             # JS module that exports a data function
tuimon watch --url http://localhost:3000/metrics  # Poll JSON endpoint

# Database (uses your project's driver from node_modules + connection from .env)
tuimon db users                     # View table/collection
tuimon db users --watch             # Live refresh
tuimon db "SELECT * FROM orders"    # Custom query
tuimon db users --env MY_DB_URI     # Specify env var for connection string
```

**Auto-detected formats:** JSON/JSONL, CSV/TSV, Nginx combined log, ModSecurity audit log (v2/v3), JSON logs, plain text.

**File watching:** Dashboard updates when the file changes on disk.

**Database support:** MongoDB, PostgreSQL, MySQL, SQLite — auto-detects the driver from `node_modules/` and connection string from `.env`.

**Navigation:** Press **D** for full-screen data table, **ESC** to go back, arrow keys to paginate.

## Terminal Support

| Terminal | Protocol | Status |
|----------|----------|--------|
| Kitty | Kitty | Supported |
| Ghostty | Kitty | Supported |
| WezTerm | Kitty | Supported |
| iTerm2 | iTerm2 | Supported |
| **VSCode** | Sixel | **Supported** |
| mlterm | Sixel | Supported |

### VSCode Setup

Running `tuimon init` automatically enables terminal images in VSCode by creating `.vscode/settings.json` with:

```json
{ "terminal.integrated.enableImages": true }
```

## Global Config

Set preferences once in `~/.tuimon/config.json`:

```bash
tuimon config db.envVar MONGODB_URI    # default env var for DB connections
tuimon config db.defaultLimit 500      # default row limit
tuimon config refresh 250              # default refresh rate
tuimon config                          # view current config
tuimon config --reset                  # reset to defaults
```

## CLI Reference

| Command | Description |
|---------|-------------|
| `tuimon <file>` | Visualize a JSON, CSV, or log file |
| `tuimon watch <file.js>` | Live dashboard from a data module |
| `tuimon watch --url <url>` | Poll a JSON endpoint |
| `tuimon db <table\|query>` | View database table or run query |
| `tuimon start` | Run from tuimon.config.ts (custom HTML) |
| `tuimon init` | Scaffold a starter project + enable VSCode |
| `tuimon check` | Check terminal graphics support |
| `tuimon config` | View/set global preferences |
| `tuimon ai` | Print AI integration guide |

**Environment:** `TUIMON_DEBUG=1` prints per-frame timing to stderr.

## How It Works

TuiMon renders your HTML pages in a headless Chromium browser via Playwright, takes PNG screenshots, and streams them to your terminal using the Kitty graphics protocol (or Sixel as fallback). The F-key bar and keyboard navigation run natively in the terminal.

Typical frame: **~50ms** (push data → screenshot → encode → display).

## Contributing

- TDD required — write tests first
- Coverage thresholds: 80% lines, 80% functions, 75% branches
- Strict TypeScript — `strict: true`, `noUncheckedIndexedAccess`, no `any`

## License

MIT
