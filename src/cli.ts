#!/usr/bin/env node

import { Command } from 'commander'
import path from 'node:path'
import { existsSync, mkdirSync, cpSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { detectGraphicsSupport } from './detect.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.resolve(__dirname, '..')

const program = new Command()

program
  .name('tuimon')
  .description('Render beautiful HTML dashboards directly in your terminal.')
  .version('0.1.0')

program
  .command('start')
  .description('Start a TuiMon dashboard')
  .option('-c, --config <path>', 'Path to config file', 'tuimon.config.ts')
  .action(async (opts: { config: string }) => {
    const configPath = path.resolve(process.cwd(), opts.config)
    if (!existsSync(configPath)) {
      console.error(`[tuimon] Config file not found: ${configPath}`)
      console.error('[tuimon] Run "tuimon init" to create a starter project.')
      process.exit(1)
    }
    // Dynamic import of the config — it self-starts
    await import(configPath)
  })

program
  .command('init')
  .description('Scaffold a starter TuiMon project in the current directory')
  .action(() => {
    const starterDir = path.resolve(pkgRoot, 'templates', 'starter')
    const targetDir = process.cwd()

    const pagesDir = path.join(targetDir, 'pages')
    const configFile = path.join(targetDir, 'tuimon.config.ts')

    if (existsSync(configFile)) {
      console.error('[tuimon] tuimon.config.ts already exists. Aborting.')
      process.exit(1)
    }

    mkdirSync(pagesDir, { recursive: true })
    cpSync(path.join(starterDir, 'pages'), pagesDir, { recursive: true })
    cpSync(path.join(starterDir, 'tuimon.config.ts'), configFile)

    console.log('TuiMon project initialized!')
    console.log('')
    console.log('  Files created:')
    console.log('    pages/overview.html')
    console.log('    pages/cpu-detail.html')
    console.log('    pages/memory-detail.html')
    console.log('    tuimon.config.ts')
    console.log('')
    console.log('  Next steps:')
    console.log('    npx tuimon start')
  })

program
  .command('check')
  .description('Check terminal graphics support')
  .action(async () => {
    const support = await detectGraphicsSupport()

    console.log('')
    console.log('TuiMon Terminal Check')
    console.log('\u2500'.repeat(21))
    console.log(`Kitty protocol:  ${support.kitty ? '\u2713 supported' : '\u2717 not detected'}`)
    console.log(`Sixel protocol:  ${support.sixel ? '\u2713 supported' : '\u2717 not detected'}`)
    console.log(`iTerm2 protocol: ${support.iterm2 ? '\u2713 supported' : '\u2717 not detected'}`)
    console.log('')

    if (support.protocol) {
      console.log(`\u2713 Will use: ${support.protocol}`)
      const term = process.env['TERM_PROGRAM'] ?? process.env['TERM'] ?? 'unknown'
      console.log(`  ${term}`)
    } else {
      console.log('\u2717 No supported graphics protocol detected.')
      console.log('  TuiMon requires Kitty, iTerm2, or Sixel graphics support.')
    }

    console.log('')
    process.exit(support.protocol ? 0 : 1)
  })

program.parse()
