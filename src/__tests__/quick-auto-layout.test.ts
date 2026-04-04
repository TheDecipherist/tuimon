import { describe, it, expect } from 'vitest'
import { autoLayout, dataToWidgetData } from '../quick/auto-layout.js'
import type { TableData, LogData, ModSecData } from '../quick/types.js'

describe('autoLayout', () => {
  describe('table data', () => {
    const tableData: TableData = {
      type: 'table',
      columns: ['name', 'age', 'active', 'role'],
      rows: [
        { name: 'Alice', age: 30, active: true, role: 'admin' },
        { name: 'Bob', age: 25, active: false, role: 'user' },
      ],
      meta: {
        totalRows: 2,
        numericColumns: ['age'],
        booleanColumns: ['active'],
        categoricalColumns: ['role'],
      },
    }

    it('generates title from filename', () => {
      const layout = autoLayout(tableData, 'user-data.json')
      expect(layout.title).toBe('User Data')
    })

    it('includes row count stat', () => {
      const layout = autoLayout(tableData, 'data.json')
      expect(layout.stats?.some((s) => s.id === '_rows')).toBe(true)
    })

    it('includes table panel', () => {
      const layout = autoLayout(tableData, 'data.json')
      expect(layout.panels?.some((p) => p.type === 'table')).toBe(true)
    })

    it('includes bar chart for numeric column', () => {
      const layout = autoLayout(tableData, 'data.json')
      expect(layout.panels?.some((p) => p.type === 'bar')).toBe(true)
    })

    it('includes doughnut for boolean column', () => {
      const layout = autoLayout(tableData, 'data.json')
      expect(layout.panels?.some((p) => p.id === '_chart_bool')).toBe(true)
    })

    it('includes doughnut for categorical column', () => {
      const layout = autoLayout(tableData, 'data.json')
      expect(layout.panels?.some((p) => p.id === '_chart_cat')).toBe(true)
    })
  })

  describe('nginx log data', () => {
    const logData: LogData = {
      type: 'log',
      format: 'nginx',
      entries: [],
      stats: { totalLines: 100, errorCount: 5, statusCodes: { '200': 80, '404': 15, '500': 5 }, methods: { GET: 90, POST: 10 }, topEndpoints: {}, topIPs: {} },
    }

    it('includes request count stat', () => {
      const layout = autoLayout(logData, 'access.log')
      expect(layout.stats?.some((s) => s.id === '_requests')).toBe(true)
    })

    it('includes status codes doughnut', () => {
      const layout = autoLayout(logData, 'access.log')
      expect(layout.panels?.some((p) => p.id === '_statusCodes')).toBe(true)
    })

    it('includes table as hero panel', () => {
      const layout = autoLayout(logData, 'access.log')
      expect(layout.panels?.some((p) => p.type === 'table')).toBe(true)
    })
  })

  describe('modsec data', () => {
    const modsecData: ModSecData = {
      type: 'modsec',
      events: [],
      stats: {
        totalEvents: 50,
        blockedRequests: 30,
        uniqueIPs: 5,
        severityCounts: { CRITICAL: 10, WARNING: 20, NOTICE: 20 },
        topRules: { '941100': 15, '942100': 10 },
        topIPs: { '1.2.3.4': 20 },
        attackCategories: { XSS: 15, SQLi: 10 },
      },
    }

    it('includes event count stat', () => {
      const layout = autoLayout(modsecData, 'modsec.log')
      expect(layout.stats?.some((s) => s.id === '_events')).toBe(true)
    })

    it('includes blocked gauge', () => {
      const layout = autoLayout(modsecData, 'modsec.log')
      expect(layout.stats?.some((s) => s.id === '_blocked' && s.type === 'gauge')).toBe(true)
    })

    it('includes severity doughnut', () => {
      const layout = autoLayout(modsecData, 'modsec.log')
      expect(layout.panels?.some((p) => p.id === '_severityDist')).toBe(true)
    })

    it('includes attack categories', () => {
      const layout = autoLayout(modsecData, 'modsec.log')
      expect(layout.panels?.some((p) => p.id === '_categories')).toBe(true)
    })

    it('includes top rules bar', () => {
      const layout = autoLayout(modsecData, 'modsec.log')
      expect(layout.panels?.some((p) => p.id === '_topRules')).toBe(true)
    })
  })
})

describe('dataToWidgetData', () => {
  it('converts table data to widget data', () => {
    const data: TableData = {
      type: 'table',
      columns: ['name', 'score'],
      rows: [{ name: 'A', score: 10 }, { name: 'B', score: 20 }],
      meta: { totalRows: 2, numericColumns: ['score'], booleanColumns: [], categoricalColumns: [] },
    }
    const widgets = dataToWidgetData(data)
    expect(widgets['_rows']).toBe(2)
    expect(widgets['_cols']).toBe(2)
    expect(widgets['_avg_score']).toBe(15)
  })

  it('converts modsec data to widget data', () => {
    const data: ModSecData = {
      type: 'modsec',
      events: [{
        uniqueId: '1', timestamp: '2026-04-04', clientIp: '1.2.3.4',
        method: 'GET', uri: '/admin', httpCode: 403,
        messages: [{ id: '941100', msg: 'XSS', severity: 'CRITICAL' }],
        raw: 'test',
      }],
      stats: {
        totalEvents: 1, blockedRequests: 1, uniqueIPs: 1,
        severityCounts: { CRITICAL: 1 }, topRules: { '941100': 1 },
        topIPs: { '1.2.3.4': 1 }, attackCategories: { XSS: 1 },
      },
    }
    const widgets = dataToWidgetData(data)
    expect(widgets['_events']).toBe(1)
    expect(widgets['_attackers']).toBe(1)
    expect(widgets['_severityDist']).toEqual({ CRITICAL: 1 })
  })
})
