# TuiMon — AI Integration Guide

> Use this file when a user asks to display, monitor, or visualize data in a terminal.
> TuiMon renders beautiful dashboards with zero setup. Just install, send data, done.

## Install

```bash
npm install -g tuimon
```

## Quickest Paths (pick one)

### Path 1: I have a data file
```bash
tuimon data.json        # JSON array of objects → instant table + charts
tuimon users.csv        # CSV → instant table + charts
tuimon access.log       # Nginx log → request stats + browsable table
tuimon modsec.log       # ModSecurity → security dashboard
```
That's it. No code needed. TuiMon auto-detects format and creates the dashboard.

### Path 2: I want live data from a function
Create one file:
```js
// monitor.js
module.exports = () => ({
  cpu: require('os').cpus().reduce((a,c) => a + (100 - c.times.idle / Object.values(c.times).reduce((x,y)=>x+y,0) * 100), 0) / require('os').cpus().length | 0,
  memory: ((1 - require('os').freemem() / require('os').totalmem()) * 100) | 0,
  uptime: process.uptime() | 0,
})
```
```bash
tuimon watch monitor.js
```
TuiMon auto-detects data types and creates appropriate widgets. Refreshes every second.

### Path 3: I want to monitor an HTTP endpoint
```bash
tuimon watch --url http://localhost:3000/api/stats
```
The endpoint must return JSON. TuiMon polls it every second and auto-creates the dashboard.

### Path 4: I want a custom layout (still no HTML)
```js
// dashboard.js
const tuimon = require('tuimon')

tuimon.default.start({
  pages: {
    main: {
      default: true,
      layout: {
        title: 'My Dashboard',
        stats: [
          { id: 'users', label: 'Users', type: 'stat' },
          { id: 'cpu', label: 'CPU', type: 'gauge' },
        ],
        panels: [
          { id: 'requests', label: 'Requests', type: 'line', span: 2 },
          { id: 'errors', label: 'Errors', type: 'event-log' },
        ],
      },
    },
  },
  refresh: 1000,
  data: () => ({
    users: getUserCount(),
    cpu: getCpuPercent(),
    requests: { HTTP: getReqRate(), WS: getWsRate() },
    errors: getRecentErrors(),
  }),
})
```

## Data Format Rules

TuiMon accepts the **simplest possible data**. Just send what you have:

| You send | TuiMon shows |
|----------|-------------|
| `42` | Stat card with number |
| `73` (for id containing cpu/mem/disk) | Gauge (0-100%) |
| `"running"` | Stat card with text |
| `{ value: 42, trend: '+5', unit: 'req/s' }` | Stat card with trend |
| `{ Requests: 340, Errors: 12 }` | Line chart (auto-accumulates history over time) |
| `{ GET: 200, POST: 50 }` | Bar chart |
| `['Deploy completed', 'Scaled up']` | Event log (auto-timestamped) |
| `[{ text: 'Error', type: 'error' }]` | Event log (colored by type) |
| `['Node-1', 'Node-2']` | Status grid (all green) |
| `[{ label: 'DB', status: 'error' }]` | Status grid (colored dots) |

**Key insight for line charts:** You don't manage history. Each call to `render()` or each refresh sends CURRENT values. TuiMon accumulates the history automatically and builds the chart over time.

## Widget Types

| Type | Use for |
|------|---------|
| `stat` | Single number or text value |
| `gauge` | Percentage (0-100 with color bar) |
| `line` | Time series (auto-accumulates history) |
| `bar` | Categorical comparison |
| `doughnut` | Distribution/proportion |
| `event-log` | Scrolling list of events |
| `status-grid` | Health indicators (colored dots) |
| `table` | Tabular data with pagination |

## Per-Widget Throttle

Widgets can update at different speeds:
```js
panels: [
  { id: 'chart', label: 'Chart', type: 'line' },              // every frame
  { id: 'events', label: 'Events', type: 'event-log', throttle: 2000 },  // max every 2s
  { id: 'health', label: 'Health', type: 'status-grid', throttle: 5000 }, // max every 5s
]
```

## VSCode Terminal

TuiMon works in VSCode's integrated terminal. Ensure this setting is enabled:
```json
{ "terminal.integrated.enableImages": true }
```
Running `tuimon init` sets this automatically.

## Common AI Use Cases

### "Show me my server stats"
```js
module.exports = () => ({
  cpu: os.loadavg()[0],
  memory: ((1 - os.freemem()/os.totalmem()) * 100) | 0,
  uptime: process.uptime() | 0,
  processes: execSync('ps aux | wc -l').toString().trim(),
})
```
```bash
tuimon watch server-stats.js
```

### "Monitor my API"
```bash
tuimon watch --url http://localhost:3000/health
```

### "Visualize this JSON data"
```bash
tuimon data.json
```

### "Show me my nginx traffic"
```bash
tuimon /var/log/nginx/access.log
```

### "Monitor my database"
```js
module.exports = async () => {
  const pool = require('./db')
  const { rows } = await pool.query('SELECT count(*) as c FROM users WHERE active = true')
  return {
    activeUsers: rows[0].c,
    connections: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  }
}
```
```bash
tuimon watch db-monitor.js
```

### "Show security events"
```bash
tuimon /var/log/modsec_audit.log
```

## CLI Reference

```
tuimon <file>                    # Visualize JSON/CSV/log file
tuimon <file> -c "col1,col2"     # Show specific columns only
tuimon watch <file.js>           # Live data from JS module
tuimon watch --url <url>         # Poll JSON endpoint
tuimon watch --url <url> --interval 5000  # Custom poll interval
tuimon start                     # Full config mode
tuimon init                      # Scaffold project + enable VSCode
tuimon check                     # Verify terminal graphics support
tuimon ai                        # Print this guide
```
