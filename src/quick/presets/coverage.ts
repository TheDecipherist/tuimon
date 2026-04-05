import { readFileSync } from 'node:fs'
import type { PresetResult } from './types.js'
import type { LayoutConfig } from '../../layout/types.js'

export function coveragePreset(filePath: string): PresetResult {
  const content = readFileSync(filePath, 'utf-8').trim()

  // Detect format
  if (content.startsWith('<')) {
    return junitPreset(filePath, content)
  }
  if (content.startsWith('TN:') || content.includes('\nSF:')) {
    return lcovPreset(filePath, content)
  }
  return istanbulPreset(filePath, content)
}

// ─── Istanbul/NYC JSON ───────────────────────────────────────────────────────

function istanbulPreset(filePath: string, content: string): PresetResult {
  const raw = JSON.parse(content) as Record<string, unknown>

  // coverage-summary.json format
  const isSummary = 'total' in raw
  const files: Array<{ file: string; lines: number; branches: number; functions: number }> = []
  let totalLines = 0
  let coveredLines = 0

  for (const [key, val] of Object.entries(raw)) {
    if (key === 'total') continue
    const entry = val as Record<string, Record<string, number>>
    const lines = entry['lines']
    if (!lines) continue
    const pct = lines['pct'] ?? 0
    files.push({
      file: key.split('/').slice(-2).join('/'),
      lines: Math.round(pct),
      branches: Math.round((entry['branches']?.['pct'] ?? 0)),
      functions: Math.round((entry['functions']?.['pct'] ?? 0)),
    })
    totalLines += lines['total'] ?? 0
    coveredLines += lines['covered'] ?? 0
  }

  const totalPct = totalLines > 0 ? Math.round((coveredLines / totalLines) * 100) : 0
  files.sort((a, b) => a.lines - b.lines)

  const dist: Record<string, number> = { '>90%': 0, '70-90%': 0, '50-70%': 0, '<50%': 0 }
  for (const f of files) {
    if (f.lines > 90) dist['>90%']!++
    else if (f.lines > 70) dist['70-90%']!++
    else if (f.lines > 50) dist['50-70%']!++
    else dist['<50%']!++
  }

  const layout: LayoutConfig = {
    title: 'Test Coverage',
    stats: [
      { id: 'totalCoverage', label: 'Coverage', type: 'gauge' },
      { id: 'totalFiles', label: 'Files', type: 'stat' },
      { id: 'coveredLines', label: 'Covered Lines', type: 'stat' },
      { id: 'uncoveredLines', label: 'Uncovered Lines', type: 'stat' },
    ],
    panels: [
      { id: 'fileList', label: 'Coverage by File', type: 'table', span: 2 },
      { id: 'coverageDist', label: 'Coverage Distribution', type: 'doughnut' },
      { id: 'lowCoverage', label: 'Low Coverage Files', type: 'event-log' },
    ],
  }

  const lowCov = files
    .filter((f) => f.lines < 70)
    .map((f) => ({
      text: `${f.file}: ${f.lines}%`,
      type: f.lines < 50 ? 'error' as const : 'warning' as const,
    }))

  return {
    layout,
    data: () => ({
      totalCoverage: totalPct,
      totalFiles: files.length,
      coveredLines,
      uncoveredLines: totalLines - coveredLines,
      fileList: {
        columns: ['File', 'Lines%', 'Branches%', 'Functions%'],
        rows: files.map((f) => ({ File: f.file, 'Lines%': f.lines, 'Branches%': f.branches, 'Functions%': f.functions })),
      },
      coverageDist: dist,
      lowCoverage: lowCov,
    }),
  }
}

// ─── LCOV ────────────────────────────────────────────────────────────────────

function lcovPreset(filePath: string, content: string): PresetResult {
  const files: Array<{ file: string; lines: number; linesFound: number; linesHit: number }> = []
  let currentFile = ''
  let lf = 0
  let lh = 0

  for (const line of content.split('\n')) {
    if (line.startsWith('SF:')) {
      currentFile = line.slice(3).split('/').slice(-2).join('/')
    } else if (line.startsWith('LF:')) {
      lf = parseInt(line.slice(3), 10)
    } else if (line.startsWith('LH:')) {
      lh = parseInt(line.slice(3), 10)
    } else if (line === 'end_of_record') {
      const pct = lf > 0 ? Math.round((lh / lf) * 100) : 0
      files.push({ file: currentFile, lines: pct, linesFound: lf, linesHit: lh })
      currentFile = ''
      lf = 0
      lh = 0
    }
  }

  const totalFound = files.reduce((a, f) => a + f.linesFound, 0)
  const totalHit = files.reduce((a, f) => a + f.linesHit, 0)
  const totalPct = totalFound > 0 ? Math.round((totalHit / totalFound) * 100) : 0
  files.sort((a, b) => a.lines - b.lines)

  const layout: LayoutConfig = {
    title: 'Test Coverage',
    stats: [
      { id: 'totalCoverage', label: 'Coverage', type: 'gauge' },
      { id: 'totalFiles', label: 'Files', type: 'stat' },
      { id: 'coveredLines', label: 'Covered Lines', type: 'stat' },
      { id: 'uncoveredLines', label: 'Uncovered Lines', type: 'stat' },
    ],
    panels: [
      { id: 'fileList', label: 'Coverage by File', type: 'table', span: 2 },
      { id: 'lowCoverage', label: 'Low Coverage Files', type: 'event-log' },
    ],
  }

  return {
    layout,
    data: () => ({
      totalCoverage: totalPct,
      totalFiles: files.length,
      coveredLines: totalHit,
      uncoveredLines: totalFound - totalHit,
      fileList: {
        columns: ['File', 'Lines%', 'Lines Found', 'Lines Hit'],
        rows: files.map((f) => ({ File: f.file, 'Lines%': f.lines, 'Lines Found': f.linesFound, 'Lines Hit': f.linesHit })),
      },
      lowCoverage: files
        .filter((f) => f.lines < 70)
        .map((f) => ({
          text: `${f.file}: ${f.lines}%`,
          type: f.lines < 50 ? 'error' as const : 'warning' as const,
        })),
    }),
  }
}

// ─── JUnit XML ───────────────────────────────────────────────────────────────

function junitPreset(filePath: string, content: string): PresetResult {
  // Simple XML parsing for JUnit format
  const testsuiteMatch = content.match(/<testsuite[^>]*\btests="(\d+)"[^>]*\bfailures="(\d+)"[^>]*(?:\berrors="(\d+)")?[^>]*(?:\btime="([^"]+)")?/g)
  let totalTests = 0
  let totalFailures = 0
  let totalErrors = 0
  let totalTime = 0

  const cases: Array<{ name: string; classname: string; time: string; status: string }> = []

  if (testsuiteMatch) {
    for (const match of testsuiteMatch) {
      const tests = match.match(/tests="(\d+)"/)
      const failures = match.match(/failures="(\d+)"/)
      const errors = match.match(/errors="(\d+)"/)
      const time = match.match(/time="([^"]+)"/)
      totalTests += parseInt(tests?.[1] ?? '0', 10)
      totalFailures += parseInt(failures?.[1] ?? '0', 10)
      totalErrors += parseInt(errors?.[1] ?? '0', 10)
      totalTime += parseFloat(time?.[1] ?? '0')
    }
  }

  // Parse individual test cases
  const caseMatches = content.matchAll(/<testcase\s+[^>]*name="([^"]*)"[^>]*classname="([^"]*)"[^>]*time="([^"]*)"[^>]*\/?>/g)
  for (const m of caseMatches) {
    const name = m[1] ?? ''
    const classname = m[2] ?? ''
    const time = m[3] ?? '0'
    // Check if there's a failure/error child
    const idx = m.index ?? 0
    const after = content.slice(idx, idx + 500)
    const hasFail = /<failure|<error/.test(after) && !after.startsWith('<testcase')
    cases.push({ name, classname, time, status: hasFail ? 'FAIL' : 'PASS' })
  }

  const layout: LayoutConfig = {
    title: 'Test Results',
    stats: [
      { id: 'totalTests', label: 'Tests', type: 'stat' },
      { id: 'passed', label: 'Passed', type: 'stat' },
      { id: 'failed', label: 'Failed', type: 'stat' },
      { id: 'duration', label: 'Duration', type: 'stat' },
    ],
    panels: [
      { id: 'resultDist', label: 'Results', type: 'doughnut' },
      { id: 'failedTests', label: 'Failed Tests', type: 'event-log' },
      { id: 'testList', label: 'All Tests', type: 'table', span: 2 },
    ],
  }

  const passed = totalTests - totalFailures - totalErrors

  return {
    layout,
    data: () => ({
      totalTests,
      passed,
      failed: totalFailures + totalErrors,
      duration: totalTime.toFixed(2) + 's',
      resultDist: { Passed: passed, Failed: totalFailures, Errors: totalErrors },
      failedTests: cases
        .filter((c) => c.status === 'FAIL')
        .map((c) => ({ text: `${c.classname} > ${c.name}`, type: 'error' as const })),
      testList: {
        columns: ['Status', 'Class', 'Test', 'Time'],
        rows: cases.map((c) => ({ Status: c.status, Class: c.classname, Test: c.name, Time: c.time + 's' })),
      },
    }),
  }
}
