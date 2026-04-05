import type { PresetResult } from './types.js'
import tuimon from '../../index.js'

export async function runPreset(preset: PresetResult): Promise<void> {
  // Get initial data before starting the dashboard
  const initialData = await Promise.resolve(preset.data())

  const dash = await tuimon.start({
    pages: {
      main: {
        html: '',
        default: true,
        layout: preset.layout,
        keys: {
          F5: { label: 'Refresh', action: async () => { await dash.render(await Promise.resolve(preset.data())) } },
          F10: { label: 'Quit', action: () => process.exit(0) },
        },
      },
    },
    refresh: preset.refresh,
    data: preset.refresh ? preset.data : undefined,
    renderDelay: 0,
  })

  // Always do an initial render
  await dash.render(initialData)
}
