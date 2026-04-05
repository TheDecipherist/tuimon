import type { LayoutConfig } from '../../layout/types.js'

export interface PresetResult {
  layout: LayoutConfig
  data: () => Record<string, unknown> | Promise<Record<string, unknown>>
  refresh?: number | undefined
}
