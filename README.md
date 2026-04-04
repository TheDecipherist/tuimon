# TuiMon

> Render beautiful dashboards directly in your terminal. Zero config required.

## The Simplest Way to Visualize Data in Your Terminal

```bash
# Visualize any data file instantly
tuimon data.json
tuimon users.csv
tuimon /var/log/nginx/access.log

# Live monitoring from a data function
tuimon watch metrics.js

# Poll a JSON API
tuimon watch --url http://localhost:3000/metrics

# Full custom dashboard (HTML/CSS/JS)
tuimon start
```

No HTML. No config files. No charting libraries. Just point TuiMon at your data.

## Terminal Support

| Terminal | Protocol | Status |
|----------|----------|--------|
| Kitty | Kitty | Supported |
| Ghostty | Kitty | Supported |
| WezTerm | Kitty | Supported |
| iTerm2 | iTerm2 | Supported |
| **VSCode** | Sixel | **Supported** (requires one setting) |
| mlterm | Sixel | Supported |

### VSCode Setup

VSCode supports terminal images but it's **off by default**. Running `tuimon init` enables it automatically by creating `.vscode/settings.json` with:

```json
{ "terminal.integrated.enableImages": true }
```

## Quick Start

```bash
npm install -g tuimon
tuimon check          # verify your terminal supports graphics
```

## 1. Instant File Visualization

Point TuiMon at any data file — it auto-detects the format, picks the right charts, and renders a dashboard:

```bash
# JSON array → table + charts
tuimon users.json

# CSV → table + charts
tuimon sales.csv

# Nginx access log → request stats + table
tuimon /var/log/nginx/access.log

# ModSecurity audit log → security dashboard
tuimon /var/log/modsec_audit.log

# Filter columns
tuimon access.log --columns "Timestamp,IP,Path,Status"
```

**Auto-detected formats:**
- **JSON/JSONL** — arrays of objects → table + stat cards + charts
- **CSV/TSV** — auto-detects delimiter, header row, column types
- **Nginx combined log** — request stats, status codes, top endpoints/IPs, browsable request table
- **ModSecurity audit log** — security events, severity distribution, attack categories, top attacker IPs
- **JSON logs** — level distribution, latest entries
- **Plain text** — live tail

**Features:**
- Press **D** to switch to full-screen data table view, **ESC** to go back
- Arrow keys / PgUp / PgDn to navigate table pages
- **F5** to reload file, **F10** to quit
- File is **watched** — dashboard updates when the file changes on disk

## 2. Live Data Monitoring

Create a JS file that exports a data function — TuiMon handles the rest:

```js
// metrics.js
const os = require('os')

module.exports = () => ({
  cpu: Math.round(100 - (os.cpus().reduce((a,c) => a + c.times.idle, 0) / os.cpus().reduce((a,c) => a + Object.values(c.times).reduce((x,y) => x+y, 0), 0)) * 100),
  memory: Math.round((1 - os.freemem() / os.totalmem()) * 100),
  uptime: Math.round(process.uptime()) + 's',
})
```

```bash
tuimon watch metrics.js
```

TuiMon inspects the returned data and auto-creates the right widgets:

| Data type | Widget |
|-----------|--------|
| Number (0-100 + name like cpu/mem) | Gauge |
| Number (other) | Stat card |
| String | Stat card |
| `{ key: number, ... }` (2+ keys) | Line chart (auto-accumulates history) |
| `{ key: number }` | Bar chart |
| `['string', ...]` | Event log (auto-timestamped) |
| `[{ label, status }, ...]` | Status grid (colored dots) |

**Export options:**

```js
module.exports = () => ({ ... })    // data function (required)
module.exports.refresh = 500        // refresh interval in ms (default: 1000)
module.exports.title = 'My App'     // dashboard title
module.exports.layout = { ... }     // override auto-detected layout
```

### Poll a JSON API

```bash
tuimon watch --url http://localhost:3000/metrics
tuimon watch --url http://localhost:3000/metrics --interval 2000
```

## 3. Zero-HTML Declarative Dashboard

For more control without writing HTML, define widgets in a layout config:

```typescript
import tuimon from 'tuimon'

const dash = await tuimon.start({
  pages: {
    overview: {
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
    users: getOnlineCount(),
    cpu: getCpuPercent(),
    traffic: { Requests: 340, Errors: 12 },
    services: { Web: 47, API: 27 },
    events: ['Deploy completed'],
    health: ['Node-1', 'Node-2'],
  }),
})
```

**8 widget types:** `stat`, `gauge`, `line`, `doughnut`, `bar`, `event-log`, `status-grid`, `table`

**Per-widget throttle:** Each widget can have its own update rate — charts update every frame while event logs and status grids update less frequently.

**Lazy data format:** Every widget accepts the simplest possible data. Just send numbers — TuiMon figures out the rest:

```typescript
dash.render({
  users: 42,                              // number → stat
  cpu: 73,                                // number → gauge (0-100)
  traffic: { Requests: 340, Errors: 12 }, // object → line chart (history auto-accumulated)
  services: { Web: 47, API: 27 },         // object → doughnut
  events: ['Deploy completed'],           // string[] → event-log (auto-timestamped)
  health: ['Node-1', 'Node-2'],           // string[] → status-grid (all "ok")
})
```

## 4. Full Custom HTML Dashboard

For complete control, write your dashboard as normal HTML/CSS/JS:

```bash
tuimon init    # scaffolds starter project
tuimon start   # runs it
```

TuiMon renders your HTML pages in a headless Chromium browser via Playwright, screenshots them as PNG, and streams the images to your terminal. Any charting library works — Chart.js, D3, ECharts, anything.

### Multi-Page Navigation

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
  },
})
```

- Press a shortcut key to jump to a detail page
- **ESC** on detail page returns to overview
- **ESC** on overview shows quit confirmation
- **Ctrl+C** exits immediately from anywhere

### Per-Page F-Key Bindings

```typescript
keys: {
  F5: { label: 'Refresh', action: async () => dash.render(await getData()) },
  F10: { label: 'Quit', action: () => process.exit(0) },
}
```

### Client Library

In your HTML pages, the injected `TuiMon` object receives data:

```javascript
TuiMon.onUpdate(function(data) {
  TuiMon.set('#cpu', data.cpu)
  TuiMon.set('#memory', data.memory + '%')
})
```

Add shortcut badges to panels with data attributes:

```html
<div class="panel" data-tm-key="g" data-tm-label="CPU Detail">
```

## CLI Reference

| Command | Description |
|---------|-------------|
| `tuimon <file>` | Visualize a JSON, CSV, or log file |
| `tuimon watch <file.js>` | Live dashboard from a data module |
| `tuimon watch --url <url>` | Poll a JSON endpoint |
| `tuimon start` | Run from tuimon.config.ts |
| `tuimon init` | Scaffold a starter project + enable VSCode |
| `tuimon check` | Check terminal graphics support |

**Options:**
- `-c, --columns <cols>` — comma-separated list of columns to display
- `--interval <ms>` — poll interval for URL watch mode (default: 1000)

**Environment:**
- `TUIMON_DEBUG=1` — print per-frame timing to stderr

## How It Works

```
Your data → TuiMon → Headless Chromium → Screenshot → Kitty/Sixel → Terminal
```

1. Your data is pushed to an HTML page running in headless Chromium
2. Playwright takes a PNG screenshot
3. The image is encoded as Kitty graphics protocol (or Sixel fallback)
4. Written directly to your terminal's stdout

Typical frame time: **~50ms** (at 250ms refresh = 4 FPS with headroom to spare).

## Contributing

- **TDD required** — write tests first, implementation second
- Coverage thresholds: 80% lines, 80% functions, 75% branches
- `npm test` must pass before any PR
- Strict TypeScript — `strict: true`, `noUncheckedIndexedAccess`, no `any`

## License

MIT
