import { describe, it, expect } from 'vitest'
import { generateDashboardHtml, validateLayout } from '../layout/generator.js'
import type { LayoutConfig } from '../layout/types.js'

const basicLayout: LayoutConfig = {
  title: 'Test Dashboard',
  stats: [
    { id: 'users', label: 'Users', type: 'stat' },
    { id: 'cpu', label: 'CPU', type: 'gauge' },
  ],
  panels: [
    { id: 'traffic', label: 'Traffic', type: 'line', span: 2 },
    { id: 'services', label: 'Services', type: 'doughnut' },
    { id: 'endpoints', label: 'Endpoints', type: 'bar' },
    { id: 'events', label: 'Events', type: 'event-log' },
    { id: 'health', label: 'Health', type: 'status-grid' },
  ],
}

describe('validateLayout', () => {
  it('does not throw for valid layout', () => {
    expect(() => validateLayout(basicLayout)).not.toThrow()
  })

  it('throws on duplicate widget IDs', () => {
    expect(() => validateLayout({
      stats: [{ id: 'cpu', label: 'CPU', type: 'stat' }],
      panels: [{ id: 'cpu', label: 'CPU Chart', type: 'line' }],
    })).toThrow(/duplicate/i)
  })

  it('throws on empty layout (no stats or panels)', () => {
    expect(() => validateLayout({})).toThrow()
  })

  it('allows stats-only layout', () => {
    expect(() => validateLayout({
      stats: [{ id: 'a', label: 'A', type: 'stat' }],
    })).not.toThrow()
  })

  it('allows panels-only layout', () => {
    expect(() => validateLayout({
      panels: [{ id: 'a', label: 'A', type: 'line' }],
    })).not.toThrow()
  })
})

describe('generateDashboardHtml', () => {
  it('returns a string containing <!DOCTYPE html>', () => {
    const html = generateDashboardHtml(basicLayout)
    expect(html).toContain('<!DOCTYPE html>')
  })

  it('includes the dashboard title', () => {
    const html = generateDashboardHtml(basicLayout)
    expect(html).toContain('Test Dashboard')
  })

  it('includes Chart.js CDN script', () => {
    const html = generateDashboardHtml(basicLayout)
    expect(html).toContain('cdn.jsdelivr.net/npm/chart.js@4')
  })

  it('generates stat card elements with data-widget-id', () => {
    const html = generateDashboardHtml(basicLayout)
    expect(html).toContain('data-widget-id="users"')
    expect(html).toContain('data-widget-id="cpu"')
  })

  it('generates panel elements for each panel', () => {
    const html = generateDashboardHtml(basicLayout)
    expect(html).toContain('data-widget-id="traffic"')
    expect(html).toContain('data-widget-id="services"')
    expect(html).toContain('data-widget-id="endpoints"')
    expect(html).toContain('data-widget-id="events"')
    expect(html).toContain('data-widget-id="health"')
  })

  it('includes widget type as data attribute', () => {
    const html = generateDashboardHtml(basicLayout)
    expect(html).toContain('data-widget-type="stat"')
    expect(html).toContain('data-widget-type="gauge"')
    expect(html).toContain('data-widget-type="line"')
    expect(html).toContain('data-widget-type="doughnut"')
    expect(html).toContain('data-widget-type="bar"')
    expect(html).toContain('data-widget-type="event-log"')
    expect(html).toContain('data-widget-type="status-grid"')
  })

  it('applies span as grid-column style for panels with span > 1', () => {
    const html = generateDashboardHtml(basicLayout)
    expect(html).toContain('grid-column: span 2')
  })

  it('includes panel labels', () => {
    const html = generateDashboardHtml(basicLayout)
    expect(html).toContain('Traffic')
    expect(html).toContain('Services')
    expect(html).toContain('Events')
  })

  it('includes shortcut badge when shortcut is defined', () => {
    const layout: LayoutConfig = {
      panels: [{
        id: 'detail', label: 'Detail', type: 'line',
        shortcut: 'g', shortcutLabel: 'CPU Detail',
      }],
    }
    const html = generateDashboardHtml(layout)
    expect(html).toContain('data-tm-key="g"')
    expect(html).toContain('CPU Detail')
  })

  it('uses default theme colors in CSS', () => {
    const html = generateDashboardHtml(basicLayout)
    expect(html).toContain('#0a0e1a') // bg
    expect(html).toContain('#00e5ff') // accent/border
  })

  it('applies custom theme overrides', () => {
    const layout: LayoutConfig = {
      stats: [{ id: 'a', label: 'A', type: 'stat' }],
      theme: { bg: '#111111', accent: '#ff0000' },
    }
    const html = generateDashboardHtml(layout)
    expect(html).toContain('#111111')
    expect(html).toContain('#ff0000')
  })

  it('includes canvas elements for chart widgets', () => {
    const html = generateDashboardHtml(basicLayout)
    expect(html).toContain('<canvas')
  })

  it('includes TuiMon.onUpdate handler in script', () => {
    const html = generateDashboardHtml(basicLayout)
    expect(html).toContain('TuiMon.onUpdate')
  })

  it('includes normalization logic for lazy data formats', () => {
    const html = generateDashboardHtml(basicLayout)
    // Should handle number → { value } normalization
    expect(html).toContain('normalize')
  })

  it('generates gauge-specific markup', () => {
    const html = generateDashboardHtml(basicLayout)
    expect(html).toContain('gauge-fill')
  })

  it('generates event-log container', () => {
    const html = generateDashboardHtml(basicLayout)
    expect(html).toContain('event-list')
  })

  it('generates status-grid container', () => {
    const html = generateDashboardHtml(basicLayout)
    expect(html).toContain('status-grid')
  })
})
