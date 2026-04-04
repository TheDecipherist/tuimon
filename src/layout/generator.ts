import type { LayoutConfig, WidgetConfig, ThemeConfig } from './types.js'
import { mergeTheme } from './theme.js'
import { generateCss } from './generator-css.js'
import { generateJs } from './generator-js.js'

// ─── Validation ──────────────────────────────────────────────────────────────

export function validateLayout(layout: LayoutConfig): void {
  const stats = layout.stats ?? []
  const panels = layout.panels ?? []

  if (stats.length === 0 && panels.length === 0) {
    throw new Error('[tuimon] Layout must have at least one stat or panel widget')
  }

  const ids = new Set<string>()
  for (const w of [...stats, ...panels]) {
    if (ids.has(w.id)) {
      throw new Error(`[tuimon] Duplicate widget id: "${w.id}"`)
    }
    ids.add(w.id)
  }
}

// ─── Widget HTML generators ─────────────────────────────────────────────────

function statCardHtml(w: WidgetConfig): string {
  if (w.type === 'gauge') {
    return `
      <div class="stat-card" data-widget-id="${w.id}" data-widget-type="gauge">
        <div class="stat-label">${esc(w.label)}</div>
        <div class="stat-value" id="val-${w.id}">--</div>
        <div class="gauge-track">
          <div class="gauge-fill" id="gauge-${w.id}" style="width: 0%"></div>
        </div>
      </div>`
  }
  return `
      <div class="stat-card" data-widget-id="${w.id}" data-widget-type="stat">
        <div class="stat-label">${esc(w.label)}</div>
        <div class="stat-value" id="val-${w.id}">--</div>
        <div class="stat-extra">
          <span class="stat-trend" id="trend-${w.id}"></span>
          <span class="stat-unit" id="unit-${w.id}"></span>
        </div>
      </div>`
}

function panelHtml(w: WidgetConfig): string {
  const spanStyle = w.span && w.span > 1 ? ` style="grid-column: span ${w.span}"` : ''
  const tmKey = w.shortcut ? ` data-tm-key="${w.shortcut}" data-tm-label="${esc(w.shortcutLabel ?? w.label)}"` : ''

  let inner = ''
  switch (w.type) {
    case 'line':
    case 'bar':
    case 'doughnut':
      inner = `<div class="chart-wrap"><canvas id="chart-${w.id}"></canvas></div>`
      break
    case 'event-log':
      inner = `<div class="event-list" id="list-${w.id}"><div class="event-empty">Waiting for data...</div></div>`
      break
    case 'status-grid':
      inner = `<div class="status-grid" id="grid-${w.id}"></div>`
      break
    case 'table':
      inner = `<div class="table-wrap" id="table-${w.id}"><div class="event-empty">Waiting for data...</div></div>`
      break
    default:
      inner = `<div id="content-${w.id}"></div>`
  }

  return `
      <div class="panel" data-widget-id="${w.id}" data-widget-type="${w.type}"${spanStyle}${tmKey}>
        <div class="panel-header">${esc(w.label)}</div>
        ${inner}
      </div>`
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ─── Main generator ──────────────────────────────────────────────────────────

export function generateDashboardHtml(layout: LayoutConfig, themeOverrides?: Partial<ThemeConfig>): string {
  validateLayout(layout)

  const theme = mergeTheme(layout.theme ?? themeOverrides)
  const stats = layout.stats ?? []
  const panels = layout.panels ?? []
  const title = layout.title ?? 'TuiMon'

  const statCardsHtml = stats.map((w) => statCardHtml(w)).join('')
  const panelsHtml = panels.map((w) => panelHtml(w)).join('')

  // Inline TuiMon client bridge so the page is fully self-contained
  const clientBridge = `
    ;(function() {
      window.__tuimon_ready__ = false;
      window.__tuimon_update__ = function(data) {
        window.__tuimon_ready__ = false;
        window.dispatchEvent(new CustomEvent('tuimon:update', { detail: data }));
        window.__tuimon_ready__ = true;
      };
      window.TuiMon = window.TuiMon || {
        onUpdate: function(cb) { window.addEventListener('tuimon:update', function(e) { cb(e.detail); }); },
        set: function(sel, val) {
          var el = document.querySelector(sel);
          if (!el) return;
          if (typeof val === 'string') el.textContent = val;
          else if (typeof val === 'number') el.textContent = val.toLocaleString();
          else if (typeof val === 'object' && val !== null) Object.assign(el.style, val);
        },
        notify: function(msg, dur) { window.dispatchEvent(new CustomEvent('tuimon:notify', { detail: { message: msg, duration: dur || 2000 } })); },
      };
    })();
  `

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <script>${clientBridge}<\/script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"><\/script>
  <style>${generateCss(theme)}</style>
</head>
<body>
  <div class="dash-header">
    <span class="dash-title">${esc(title)}</span>
    <span class="dash-time" id="dash-time"></span>
  </div>
${stats.length > 0 ? `  <div class="stat-row">${statCardsHtml}\n  </div>` : ''}
${panels.length > 0 ? `  <div class="panel-grid">${panelsHtml}\n  </div>` : ''}
  <script>${generateJs(layout, theme)}<\/script>
</body>
</html>`
}
