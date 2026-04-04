import type { LayoutConfig, WidgetConfig, ThemeConfig } from './types.js'
import { mergeTheme } from './theme.js'

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

// ─── CSS generator ───────────────────────────────────────────────────────────

function generateCss(t: ThemeConfig): string {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: ${t.bg};
      color: ${t.text};
      font-family: ${t.fontFamily};
      padding: 10px;
      overflow: hidden;
      height: 100vh;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    /* ── Header ── */
    .dash-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 8px;
      border-bottom: 1px solid ${t.border}33;
      flex-shrink: 0;
    }
    .dash-title {
      font-size: 16px;
      font-weight: 600;
      color: ${t.accent};
      text-transform: uppercase;
      letter-spacing: 2px;
    }
    .dash-time { font-size: 11px; color: ${t.textMuted}; }

    /* ── Stat cards ── */
    .stat-row {
      display: flex;
      gap: 10px;
      flex-shrink: 0;
    }
    .stat-card {
      flex: 1;
      background: ${t.panelBg};
      border: 1px solid ${t.border}44;
      border-radius: 6px;
      padding: 12px 16px;
      min-width: 0;
    }
    .stat-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: ${t.textMuted};
    }
    .stat-value {
      font-size: 28px;
      font-weight: 700;
      color: ${t.accent};
      margin-top: 2px;
    }
    .stat-extra { font-size: 11px; margin-top: 2px; }
    .stat-trend { color: ${t.success}; margin-right: 6px; }
    .stat-unit { color: ${t.textMuted}; }

    /* ── Gauge ── */
    .gauge-track {
      height: 6px;
      background: ${t.border}22;
      border-radius: 3px;
      margin-top: 8px;
      overflow: hidden;
    }
    .gauge-fill {
      height: 100%;
      border-radius: 3px;
      background: ${t.success};
      transition: width 0.4s ease, background 0.4s ease;
    }

    /* ── Panel grid ── */
    .panel-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
      gap: 10px;
      flex: 1;
      min-height: 0;
    }
    .panel {
      background: ${t.panelBg};
      border: 1px solid ${t.border}44;
      border-radius: 6px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
      position: relative;
    }
    .panel-header {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: ${t.textMuted};
      margin-bottom: 8px;
      flex-shrink: 0;
    }
    .chart-wrap { flex: 1; min-height: 0; position: relative; }
    .chart-wrap canvas { width: 100% !important; height: 100% !important; }

    /* ── Event log ── */
    .event-list {
      flex: 1;
      overflow-y: auto;
      font-size: 12px;
      font-family: monospace;
    }
    .event-entry {
      padding: 4px 0;
      border-bottom: 1px solid ${t.border}15;
      line-height: 1.5;
    }
    .event-time { color: ${t.textMuted}; margin-right: 8px; font-size: 10px; }
    .event-text { color: ${t.text}; }
    .event-entry.success .event-text { color: ${t.success}; }
    .event-entry.warning .event-text { color: ${t.warning}; }
    .event-entry.error .event-text { color: ${t.danger}; }
    .event-empty { color: ${t.textMuted}; font-style: italic; }

    /* ── Status grid ── */
    .status-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      padding: 4px 0;
    }
    .status-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
    }
    .status-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .status-dot.ok { background: ${t.success}; box-shadow: 0 0 6px ${t.success}66; }
    .status-dot.warn { background: ${t.warning}; box-shadow: 0 0 6px ${t.warning}66; }
    .status-dot.error { background: ${t.danger}; box-shadow: 0 0 6px ${t.danger}66; }
    .status-dot.unknown { background: ${t.textMuted}; }
    .status-label { color: ${t.text}; }

    /* ── Table ── */
    .table-wrap {
      flex: 1;
      overflow: hidden;
      font-size: 12px;
      display: flex;
      flex-direction: column;
    }
    .table-scroll {
      flex: 1;
      overflow: hidden;
    }
    .table-wrap table {
      width: 100%;
      border-collapse: collapse;
      font-family: monospace;
    }
    .table-wrap th {
      position: sticky;
      top: 0;
      background: ${t.bg};
      color: ${t.accent};
      text-align: left;
      padding: 6px 10px;
      border-bottom: 1px solid ${t.border}44;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .table-wrap td {
      padding: 4px 10px;
      border-bottom: 1px solid ${t.border}15;
      color: ${t.text};
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 300px;
    }
    .table-wrap tr:nth-child(even) td { background: ${t.border}08; }
    .table-wrap td.num { color: ${t.accent}; }
    .table-info {
      font-size: 11px;
      color: ${t.accent};
      padding: 6px 0 2px;
      flex-shrink: 0;
      border-top: 1px solid ${t.border}33;
    }
  `
}

// ─── Browser-side JS ─────────────────────────────────────────────────────────

function generateJs(layout: LayoutConfig, t: ThemeConfig): string {
  const allWidgets = [...(layout.stats ?? []), ...(layout.panels ?? [])]
  const widgetMapJson = JSON.stringify(
    Object.fromEntries(allWidgets.map((w) => [w.id, w.type])),
  )
  const throttleMapJson = JSON.stringify(
    Object.fromEntries(allWidgets.filter((w) => w.throttle).map((w) => [w.id, w.throttle])),
  )
  const chartColorsJson = JSON.stringify(t.chartColors)

  return `
    (function() {
      'use strict';
      var CHART_COLORS = ${chartColorsJson};
      var WIDGET_MAP = ${widgetMapJson};
      var THROTTLE_MAP = ${throttleMapJson};
      var lastUpdateTime = {};
      var charts = {};
      var lineHistory = {};
      var MAX_LINE_POINTS = 60;
      var MAX_BAR_POINTS = 20;
      var MAX_EVENTS = 10;
      var theme = {
        success: '${t.success}',
        warning: '${t.warning}',
        danger: '${t.danger}',
        textMuted: '${t.textMuted}',
        text: '${t.text}',
        border: '${t.border}',
        panelBg: '${t.panelBg}',
      };

      // ── Normalization ──
      function normalize(id, raw) {
        var type = WIDGET_MAP[id];
        if (!type) return raw;

        if (type === 'stat') {
          if (typeof raw === 'number' || typeof raw === 'string') return { value: raw };
          return raw;
        }
        if (type === 'gauge') {
          if (typeof raw === 'number') return { value: raw, max: 100 };
          return raw;
        }
        if (type === 'line') {
          if (raw && typeof raw === 'object' && !Array.isArray(raw) && !raw.series) {
            return { _kvUpdate: raw };
          }
          return raw;
        }
        if (type === 'event-log') {
          if (!Array.isArray(raw)) return raw;
          return raw.map(function(item) {
            if (typeof item === 'string') return { text: item, type: 'info', time: new Date().toLocaleTimeString() };
            if (!item.time) item.time = new Date().toLocaleTimeString();
            if (!item.type) item.type = 'info';
            return item;
          });
        }
        if (type === 'status-grid') {
          if (!Array.isArray(raw)) return raw;
          return raw.map(function(item) {
            if (typeof item === 'string') return { label: item, status: 'ok' };
            return item;
          });
        }
        return raw;
      }

      // ── Widget updaters ──
      function updateStat(id, data) {
        var valEl = document.getElementById('val-' + id);
        var trendEl = document.getElementById('trend-' + id);
        var unitEl = document.getElementById('unit-' + id);
        if (valEl) valEl.textContent = typeof data.value === 'number' ? data.value.toLocaleString() : data.value;
        if (trendEl) trendEl.textContent = data.trend || '';
        if (unitEl) unitEl.textContent = data.unit || '';
      }

      function updateGauge(id, data) {
        var max = data.max || 100;
        var pct = Math.min(100, Math.round((data.value / max) * 100));
        var valEl = document.getElementById('val-' + id);
        var fillEl = document.getElementById('gauge-' + id);
        if (valEl) valEl.textContent = pct + '%' + (data.label ? ' ' + data.label : '');
        if (fillEl) {
          fillEl.style.width = pct + '%';
          if (pct > 80) fillEl.style.background = theme.danger;
          else if (pct > 60) fillEl.style.background = theme.warning;
          else fillEl.style.background = theme.success;
        }
      }

      function ensureLineChart(id) {
        if (charts[id]) return charts[id];
        var canvas = document.getElementById('chart-' + id);
        if (!canvas) return null;
        lineHistory[id] = {};
        charts[id] = new Chart(canvas, {
          type: 'line',
          data: { labels: [], datasets: [] },
          options: {
            responsive: true, maintainAspectRatio: false, animation: false,
            scales: {
              y: { grid: { color: theme.border + '22' }, ticks: { color: theme.textMuted } },
              x: { display: false },
            },
            plugins: { legend: { labels: { color: theme.text, font: { size: 10 } } } },
          },
        });
        return charts[id];
      }

      function updateLine(id, data) {
        var chart = ensureLineChart(id);
        if (!chart) return;
        var hist = lineHistory[id];

        if (data._kvUpdate) {
          var kv = data._kvUpdate;
          Object.keys(kv).forEach(function(key) {
            if (!hist[key]) hist[key] = [];
            hist[key].push(kv[key]);
            if (hist[key].length > MAX_LINE_POINTS) hist[key].shift();
          });
        } else if (data.series) {
          data.series.forEach(function(s) {
            if (!hist[s.label]) hist[s.label] = [];
            s.data.forEach(function(v) { hist[s.label].push(v); });
            if (hist[s.label].length > MAX_LINE_POINTS) hist[s.label] = hist[s.label].slice(-MAX_LINE_POINTS);
          });
        }

        var labels = Object.keys(hist);
        var maxLen = 0;
        labels.forEach(function(k) { if (hist[k].length > maxLen) maxLen = hist[k].length; });
        chart.data.labels = Array.from({ length: maxLen }, function(_, i) { return i; });
        chart.data.datasets = labels.map(function(label, i) {
          return {
            label: label,
            data: hist[label],
            borderColor: CHART_COLORS[i % CHART_COLORS.length],
            backgroundColor: CHART_COLORS[i % CHART_COLORS.length] + '18',
            fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2,
          };
        });
        chart.update();
      }

      function ensureDoughnutChart(id) {
        if (charts[id]) return charts[id];
        var canvas = document.getElementById('chart-' + id);
        if (!canvas) return null;
        charts[id] = new Chart(canvas, {
          type: 'doughnut',
          data: { labels: [], datasets: [{ data: [], backgroundColor: [], borderWidth: 0 }] },
          options: {
            responsive: true, maintainAspectRatio: false, animation: false, cutout: '60%',
            plugins: { legend: { position: 'bottom', labels: { color: theme.text, font: { size: 10 }, padding: 12 } } },
          },
        });
        return charts[id];
      }

      function updateDoughnut(id, data) {
        var chart = ensureDoughnutChart(id);
        if (!chart) return;
        var keys = Object.keys(data);
        chart.data.labels = keys;
        chart.data.datasets[0].data = keys.map(function(k) { return data[k]; });
        chart.data.datasets[0].backgroundColor = keys.map(function(_, i) { return CHART_COLORS[i % CHART_COLORS.length]; });
        chart.update();
      }

      function ensureBarChart(id) {
        if (charts[id]) return charts[id];
        var canvas = document.getElementById('chart-' + id);
        if (!canvas) return null;
        charts[id] = new Chart(canvas, {
          type: 'bar',
          data: { labels: [], datasets: [{ data: [], backgroundColor: [] }] },
          options: {
            responsive: true, maintainAspectRatio: false, animation: false,
            scales: {
              y: { grid: { color: theme.border + '22' }, ticks: { color: theme.textMuted } },
              x: { ticks: { color: theme.textMuted, font: { size: 10 } } },
            },
            plugins: { legend: { display: false } },
          },
        });
        return charts[id];
      }

      function updateBar(id, data) {
        var chart = ensureBarChart(id);
        if (!chart) return;
        var keys = Object.keys(data);
        chart.data.labels = keys;
        chart.data.datasets[0].data = keys.map(function(k) { return data[k]; });
        chart.data.datasets[0].backgroundColor = keys.map(function(_, i) { return CHART_COLORS[i % CHART_COLORS.length]; });
        chart.update();
      }

      function updateEventLog(id, data) {
        var list = document.getElementById('list-' + id);
        if (!list || !Array.isArray(data)) return;
        var items = data.slice(0, MAX_EVENTS);
        list.innerHTML = items.map(function(e) {
          return '<div class="event-entry ' + (e.type || '') + '">'
            + '<span class="event-time">' + (e.time || '') + '</span>'
            + '<span class="event-text">' + (e.text || '') + '</span>'
            + '</div>';
        }).join('');
      }

      function updateStatusGrid(id, data) {
        var grid = document.getElementById('grid-' + id);
        if (!grid || !Array.isArray(data)) return;
        grid.innerHTML = data.map(function(item) {
          return '<div class="status-item">'
            + '<div class="status-dot ' + (item.status || 'unknown') + '"></div>'
            + '<span class="status-label">' + (item.label || '') + '</span>'
            + '</div>';
        }).join('');
      }

      // ── Table with pagination ──
      var tableState = {};  // { id: { data, page, perPage } }

      function updateTable(id, data) {
        var wrap = document.getElementById('table-' + id);
        if (!wrap || !data || !data.columns || !data.rows) return;

        if (!tableState[id]) {
          tableState[id] = { data: data, page: 0, perPage: 25 };
        } else {
          tableState[id].data = data;
        }

        renderTablePage(id);
      }

      function renderTablePage(id) {
        var wrap = document.getElementById('table-' + id);
        var state = tableState[id];
        if (!wrap || !state) return;

        var data = state.data;
        var cols = data.columns;
        var allRows = data.rows;

        // Auto-calculate rows per page based on panel height
        // ~22px per row, ~30px header, ~25px footer
        var wrapH = wrap.clientHeight || 300;
        var perPage = Math.max(5, Math.floor((wrapH - 65) / 22));
        state.perPage = perPage;

        var totalPages = Math.max(1, Math.ceil(allRows.length / perPage));
        if (state.page >= totalPages) state.page = totalPages - 1;
        if (state.page < 0) state.page = 0;

        var start = state.page * perPage;
        var pageRows = allRows.slice(start, start + perPage);

        var tableHtml = '<table><thead><tr>';
        cols.forEach(function(c) { tableHtml += '<th>' + c + '</th>'; });
        tableHtml += '</tr></thead><tbody>';
        pageRows.forEach(function(row) {
          tableHtml += '<tr>';
          cols.forEach(function(c) {
            var val = row[c];
            var isNum = typeof val === 'number';
            tableHtml += '<td' + (isNum ? ' class="num"' : '') + '>'
              + (val != null ? (isNum ? val.toLocaleString() : String(val)) : '')
              + '</td>';
          });
          tableHtml += '</tr>';
        });
        tableHtml += '</tbody></table>';

        var html = '<div class="table-scroll">' + tableHtml + '</div>';

        if (totalPages > 1) {
          html += '<div class="table-info">'
            + '\u25C0 Page ' + (state.page + 1) + ' of ' + totalPages
            + ' (' + allRows.length.toLocaleString() + ' rows) \u25B6'
            + '  |  \u2191\u2193 Arrow keys to navigate'
            + '</div>';
        } else if (allRows.length > 0) {
          html += '<div class="table-info">' + allRows.length.toLocaleString() + ' rows</div>';
        }

        wrap.innerHTML = html;
      }

      // Listen for page navigation keys from TuiMon
      window.addEventListener('tuimon:tableNav', function(e) {
        var detail = e.detail;
        var ids = Object.keys(tableState);
        if (ids.length === 0) return;
        var id = ids[0]; // navigate first table
        var state = tableState[id];
        if (!state) return;

        var totalPages = Math.max(1, Math.ceil(state.data.rows.length / state.perPage));

        switch (detail.action) {
          case 'next': state.page = Math.min(state.page + 1, totalPages - 1); break;
          case 'prev': state.page = Math.max(state.page - 1, 0); break;
          case 'first': state.page = 0; break;
          case 'last': state.page = totalPages - 1; break;
        }
        renderTablePage(id);
      });

      // ── Main update handler ──
      TuiMon.onUpdate(function(data) {
        var timeEl = document.getElementById('dash-time');
        if (timeEl) timeEl.textContent = new Date().toLocaleTimeString();

        var now = Date.now();
        Object.keys(data).forEach(function(id) {
          var type = WIDGET_MAP[id];
          if (!type) return;

          // Throttle check — skip if updated too recently
          var throttle = THROTTLE_MAP[id];
          if (throttle) {
            var last = lastUpdateTime[id] || 0;
            if (now - last < throttle) return;
          }
          lastUpdateTime[id] = now;

          var val = normalize(id, data[id]);

          switch (type) {
            case 'stat': updateStat(id, val); break;
            case 'gauge': updateGauge(id, val); break;
            case 'line': updateLine(id, val); break;
            case 'doughnut': updateDoughnut(id, val); break;
            case 'bar': updateBar(id, val); break;
            case 'event-log': updateEventLog(id, val); break;
            case 'status-grid': updateStatusGrid(id, val); break;
            case 'table': updateTable(id, val); break;
          }
        });
      });
    })();
  `
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
