#!/usr/bin/env npx tsx

/**
 * Test presets by generating screenshots via Playwright.
 * No terminal graphics needed - just verify the HTML renders correctly.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { chromium } from 'playwright'
import { generateDashboardHtml } from '../src/layout/generator.js'

// Import presets
import { gitPreset } from '../src/quick/presets/git.js'
import { psPreset } from '../src/quick/presets/ps.js'
import { depsPreset } from '../src/quick/presets/deps.js'

async function screenshotPreset(name: string, layout: import('../src/layout/types.js').LayoutConfig, data: Record<string, unknown>) {
  const html = generateDashboardHtml(layout)
  const tmpDir = path.join(tmpdir(), `tuimon-preset-test-${Date.now()}`)
  mkdirSync(tmpDir, { recursive: true })
  const htmlPath = path.join(tmpDir, 'dashboard.html')
  writeFileSync(htmlPath, html, 'utf-8')

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto(`file://${htmlPath}`, { waitUntil: 'domcontentloaded' })

  // Push data
  await page.evaluate((d: Record<string, unknown>) => {
    const win = globalThis as Record<string, unknown>
    if (typeof win['__tuimon_update__'] === 'function') {
      ;(win['__tuimon_update__'] as (d: Record<string, unknown>) => void)(d)
    }
  }, data)

  await new Promise((r) => setTimeout(r, 500))

  const outPath = path.resolve(`examples/preset-${name}.png`)
  const buf = await page.screenshot({ type: 'png' })
  writeFileSync(outPath, buf)
  await browser.close()
  console.log(`  ${name}: ${outPath}`)
}

async function main() {
  console.log('Testing presets via Playwright screenshots...\n')

  // Git preset
  try {
    const git = gitPreset()
    const gitData = await Promise.resolve(git.data())
    await screenshotPreset('git', git.layout, gitData)
  } catch (err) {
    console.log(`  git: SKIP - ${err instanceof Error ? err.message : err}`)
  }

  // PS preset
  try {
    const ps = psPreset()
    const psData = await Promise.resolve(ps.data())
    await screenshotPreset('ps', ps.layout, psData)
  } catch (err) {
    console.log(`  ps: SKIP - ${err instanceof Error ? err.message : err}`)
  }

  // Deps preset
  try {
    const deps = depsPreset(path.resolve('package-lock.json'))
    const depsData = await Promise.resolve(deps.data())
    await screenshotPreset('deps', deps.layout, depsData)
  } catch (err) {
    console.log(`  deps: SKIP - ${err instanceof Error ? err.message : err}`)
  }

  // Docker preset - only if docker is running
  try {
    const { dockerPreset } = await import('../src/quick/presets/docker.js')
    const docker = dockerPreset()
    const dockerData = await Promise.resolve(docker.data())
    await screenshotPreset('docker', docker.layout, dockerData)
  } catch (err) {
    console.log(`  docker: SKIP - ${err instanceof Error ? err.message : err}`)
  }

  console.log('\nDone. Open the PNG files to verify.')
}

main().catch(console.error)
