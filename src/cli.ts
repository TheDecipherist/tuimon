#!/usr/bin/env node

import { Command } from 'commander'
import path from 'node:path'
import { existsSync, mkdirSync, cpSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { detectGraphicsSupport } from './detect.js'

process.on('unhandledRejection', (reason) => {
  console.error('[tuimon] Unhandled rejection:', reason)
  process.exit(1)
})

process.on('uncaughtException', (error) => {
  console.error('[tuimon] Uncaught exception:', error)
  process.exit(1)
})

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.resolve(__dirname, '..')

const program = new Command()

program
  .name('tuimon')
  .description('Render beautiful HTML dashboards directly in your terminal.')
  .version('0.1.0')

// ─── Default command: tuimon <file> ──────────────────────────────────────────

program
  .argument('[file]', 'JSON, CSV, or log file to visualize')
  .option('-c, --columns <cols>', 'Comma-separated list of columns to display (e.g. "ip,path,status")')
  .action(async (file: string | undefined, opts: { columns?: string }) => {
    if (!file) {
      // Check if stdin is piped
      if (!process.stdin.isTTY) {
        const { startFileMode } = await import('./quick/file-mode.js')
        // Read stdin to temp file and display
        const chunks: Buffer[] = []
        for await (const chunk of process.stdin) {
          chunks.push(chunk as Buffer)
        }
        const { tmpdir } = await import('node:os')
        const tmpPath = path.join(tmpdir(), `tuimon-stdin-${Date.now()}.json`)
        writeFileSync(tmpPath, Buffer.concat(chunks))
        process.once('beforeExit', () => { try { require('node:fs').unlinkSync(tmpPath) } catch {} })
        const columns = opts.columns ? opts.columns.split(',').map((c) => c.trim()).filter(Boolean) : undefined
        await startFileMode(tmpPath, { columns })
        return
      }
      program.help()
      return
    }

    const columns = opts.columns ? opts.columns.split(',').map((c) => c.trim()).filter(Boolean) : undefined

    // Quick mode: detect file type and visualize
    const { detectInputType } = await import('./quick/detect.js')
    const inputType = detectInputType(file)

    if (inputType === 'module') {
      const { startWatchModule } = await import('./quick/watch-mode.js')
      await startWatchModule(file)
    } else if (inputType === 'url') {
      const { startWatchUrl } = await import('./quick/watch-mode.js')
      await startWatchUrl(file)
    } else {
      if (!existsSync(file)) {
        console.error(`[tuimon] File not found: ${file}`)
        process.exit(1)
      }
      const { startFileMode } = await import('./quick/file-mode.js')
      await startFileMode(file, { columns })
    }
  })

// ─── Watch command: tuimon watch <file|--url> ────────────────────────────────

program
  .command('watch <file>')
  .description('Watch a JS/TS data module or file for live updates')
  .option('--url <url>', 'Poll a JSON endpoint instead of a file')
  .option('--interval <ms>', 'Poll interval in ms (default: 1000)', '1000')
  .action(async (file: string, opts: { url?: string; interval: string }) => {
    if (opts.url) {
      const { startWatchUrl } = await import('./quick/watch-mode.js')
      await startWatchUrl(opts.url, parseInt(opts.interval, 10))
    } else {
      const { detectInputType } = await import('./quick/detect.js')
      const inputType = detectInputType(file)

      if (inputType === 'module') {
        const { startWatchModule } = await import('./quick/watch-mode.js')
        await startWatchModule(file)
      } else {
        if (!existsSync(file)) {
          console.error(`[tuimon] File not found: ${file}`)
          process.exit(1)
        }
        const { startFileMode } = await import('./quick/file-mode.js')
        await startFileMode(file)
      }
    }
  })

// ─── Start command: tuimon start (full config mode) ──────────────────────────

program
  .command('start')
  .description('Start a TuiMon dashboard from a config file')
  .option('-c, --config <path>', 'Path to config file', 'tuimon.config.ts')
  .action(async (opts: { config: string }) => {
    const configPath = path.resolve(process.cwd(), opts.config)
    if (!existsSync(configPath)) {
      console.error(`[tuimon] Config file not found: ${configPath}`)
      console.error('[tuimon] Run "tuimon init" to create a starter project.')
      process.exit(1)
    }
    await import(configPath)
  })

// ─── Init command ────────────────────────────────────────────────────────────

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

    // Enable VSCode terminal image support
    const vscodeDir = path.join(targetDir, '.vscode')
    const vscodeSettings = path.join(vscodeDir, 'settings.json')
    mkdirSync(vscodeDir, { recursive: true })

    let settings: Record<string, unknown> = {}
    if (existsSync(vscodeSettings)) {
      try {
        settings = JSON.parse(readFileSync(vscodeSettings, 'utf-8')) as Record<string, unknown>
      } catch { /* overwrite */ }
    }

    if (!settings['terminal.integrated.enableImages']) {
      settings['terminal.integrated.enableImages'] = true
      writeFileSync(vscodeSettings, JSON.stringify(settings, null, 2) + '\n', 'utf-8')
    }

    console.log('TuiMon project initialized!')
    console.log('')
    console.log('  Files created:')
    console.log('    pages/overview.html')
    console.log('    pages/cpu-detail.html')
    console.log('    pages/memory-detail.html')
    console.log('    tuimon.config.ts')
    console.log('    .vscode/settings.json  (terminal images enabled)')
    console.log('')
    console.log('  Next steps:')
    console.log('    npx tuimon start')
  })

// ─── Check command ───────────────────────────────────────────────────────────

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

    if (process.env['TERM_PROGRAM'] === 'vscode') {
      console.log('')
      console.log('  VSCode detected \u2014 make sure this setting is enabled:')
      console.log('    "terminal.integrated.enableImages": true')
      console.log('')
      console.log('  Run "tuimon init" to configure this automatically.')
    }

    console.log('')
    process.exit(support.protocol ? 0 : 1)
  })

// ─── DB command ──────────────────────────────────────────────────────────────

program
  .command('db <target>')
  .description('View a database table/collection or run a query')
  .option('--uri <uri>', 'Database connection URI')
  .option('--env <var>', 'Env variable name for connection string')
  .option('--query <json>', 'MongoDB query filter (JSON)')
  .option('--sort <json>', 'MongoDB sort (JSON)')
  .option('--limit <n>', 'Row limit', '100')
  .option('--watch', 'Re-query on interval')
  .option('--interval <ms>', 'Watch interval in ms', '2000')
  .option('-c, --columns <cols>', 'Comma-separated columns to display')
  .action(async (target: string, opts: {
    uri?: string; env?: string; query?: string; sort?: string
    limit: string; watch?: boolean; interval: string; columns?: string
  }) => {
    const { startDbMode } = await import('./quick/db-mode.js')
    await startDbMode({
      target,
      uri: opts.uri,
      envVarName: opts.env,
      query: opts.query,
      sort: opts.sort,
      limit: parseInt(opts.limit, 10),
      watch: opts.watch,
      interval: parseInt(opts.interval, 10),
      columns: opts.columns ? opts.columns.split(',').map((c) => c.trim()).filter(Boolean) : undefined,
    })
  })

// ─── Config command ──────────────────────────────────────────────────────────

program
  .command('config [key] [value]')
  .description('View or set TuiMon configuration')
  .option('--reset', 'Reset config to defaults')
  .action(async (key: string | undefined, value: string | undefined, opts: { reset?: boolean }) => {
    const { loadConfig, saveConfig, resetConfig, printConfig, getConfigValue, setConfigValue } = await import('./config.js')

    if (opts.reset) {
      resetConfig()
      console.log('[tuimon] Config reset to defaults.')
      return
    }

    const config = loadConfig()

    if (!key) {
      printConfig(config)
      return
    }

    if (!value) {
      const val = getConfigValue(config, key)
      console.log(val === null ? '(not set)' : String(val))
      return
    }

    const updated = setConfigValue(config, key, value)
    saveConfig(updated)
    console.log(`[tuimon] Set ${key} = ${value}`)
  })

// ─── AI command ──────────────────────────────────────────────────────────────

program
  .command('ai')
  .description('Print AI integration guide (for LLMs to learn how to use TuiMon)')
  .action(() => {
    const aiMdPath = path.resolve(pkgRoot, 'AI.md')
    if (existsSync(aiMdPath)) {
      console.log(readFileSync(aiMdPath, 'utf-8'))
    } else {
      console.error('[tuimon] AI.md not found in package')
      process.exit(1)
    }
  })

program.parse()
