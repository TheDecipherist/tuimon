import type { ThemeConfig } from './types.js'

export function generateCss(t: ThemeConfig): string {
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
