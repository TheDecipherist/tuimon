import type { LayoutConfig, ThemeConfig } from './types.js'

export function generateJs(layout: LayoutConfig, t: ThemeConfig): string {
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
      var theme = ${JSON.stringify({
        success: t.success,
        warning: t.warning,
        danger: t.danger,
        textMuted: t.textMuted,
        text: t.text,
        border: t.border,
        panelBg: t.panelBg,
      })};

      // ── HTML escaping for innerHTML safety ──
      function escHtml(s) {
        if (s == null) return '';
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      }

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
          return '<div class="event-entry ' + escHtml(e.type || '') + '">'
            + '<span class="event-time">' + escHtml(e.time || '') + '</span>'
            + '<span class="event-text">' + escHtml(e.text || '') + '</span>'
            + '</div>';
        }).join('');
      }

      function updateStatusGrid(id, data) {
        var grid = document.getElementById('grid-' + id);
        if (!grid || !Array.isArray(data)) return;
        grid.innerHTML = data.map(function(item) {
          return '<div class="status-item">'
            + '<div class="status-dot ' + escHtml(item.status || 'unknown') + '"></div>'
            + '<span class="status-label">' + escHtml(item.label || '') + '</span>'
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
        cols.forEach(function(c) { tableHtml += '<th>' + escHtml(c) + '</th>'; });
        tableHtml += '</tr></thead><tbody>';
        pageRows.forEach(function(row) {
          tableHtml += '<tr>';
          cols.forEach(function(c) {
            var val = row[c];
            var isNum = typeof val === 'number';
            tableHtml += '<td' + (isNum ? ' class="num"' : '') + '>'
              + (val != null ? escHtml(isNum ? val.toLocaleString() : String(val)) : '')
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
