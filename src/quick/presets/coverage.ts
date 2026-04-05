import { readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import type { LayoutConfig } from '../../layout/types.js'
import type { PresetResult } from './types.js'

// ─── Istanbul/NYC types ──────────────────────────────────────────────────────

interface IstanbulCoverageStat {
  total: number
  covered: number
  skipped: number
  pct: number
}

interface IstanbulFileSummary {
  lines: IstanbulCoverageStat
  branches: IstanbulCoverageStat
  functions: IstanbulCoverageStat
  statements: IstanbulCoverageStat
}

interface IstanbulSummaryReport {
  total: IstanbulFileSummary
  [filePath: string]: IstanbulFileSummary
}

interface IstanbulFinalEntry {
  path: string
  s: Record<string, number>
  b: Record<string, number[]>
  f: Record<string, number>
  statementMap: Record<string, unknown>
  branchMap: Record<string, unknown>
  fnMap: Record<string, unknown>
}

// ─── Lcov types ──────────────────────────────────────────────────────────────

interface LcovFileEntry {
  file: string
  linesFound: number
  linesHit: number
}

// ─── JUnit types ─────────────────────────────────────────────────────────────

interface JUnitTestCase {
  name: string
  classname: string
  time: number
  status: 'pass' | 'fail'
}

// ─── Shared layout ──────────────────────────────────────────────────────────

const coverageLayout: LayoutConfig = {
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

const junitLayout: LayoutConfig = {
  title: 'Test Coverage',
  stats: [
    { id: 'totalCoverage', label: 'Tests', type: 'stat' },
    { id: 'totalFiles', label: 'Passed', type: 'stat' },
    { id: 'coveredLines', label: 'Failed', type: 'stat' },
    { id: 'uncoveredLines', label: 'Duration', type: 'stat' },
  ],
  panels: [
    { id: 'fileList', label: 'Test Cases', type: 'table', span: 2 },
    { id: 'coverageDist', label: 'Coverage Distribution', type: 'doughnut' },
    { id: 'lowCoverage', label: 'Low Coverage Files', type: 'event-log' },
  ],
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function shortenPath(fullPath: string): string {
  try {
    return relative(process.cwd(), fullPath)
  } catch {
    return fullPath
  }
}

function buildDistribution(coverages: number[]): Record<string, number> {
  let high = 0
  let medium = 0
  let low = 0
  let veryLow = 0

  for (const pct of coverages) {
    if (pct > 90) high++
    else if (pct > 70) medium++
    else if (pct > 50) low++
    else veryLow++
  }

  return {
    '>90%': high,
    '70-90%': medium,
    '50-70%': low,
    '<50%': veryLow,
  }
}

function buildLowCoverageEntries(
  files: Array<{ name: string; pct: number }>,
): Array<{ text: string; type: 'error' | 'warning' }> {
  const entries: Array<{ text: string; type: 'error' | 'warning' }> = []
  const sorted = [...files].sort((a, b) => a.pct - b.pct)

  for (const f of sorted) {
    if (f.pct < 50) {
      entries.push({ text: `${f.name}: ${f.pct.toFixed(1)}%`, type: 'error' })
    } else if (f.pct < 70) {
      entries.push({ text: `${f.name}: ${f.pct.toFixed(1)}%`, type: 'warning' })
    }
  }

  return entries
}

// ─── Format detection ────────────────────────────────────────────────────────

type Format = 'istanbul-summary' | 'istanbul-final' | 'lcov' | 'junit'

function detectFormat(content: string, filePath: string): Format {
  const trimmed = content.trim()

  // XML-based JUnit
  if (trimmed.startsWith('<?xml') || trimmed.startsWith('<testsuites') || trimmed.startsWith('<testsuite')) {
    return 'junit'
  }

  // lcov
  if (filePath.endsWith('.info') || (trimmed.includes('SF:') && trimmed.includes('end_of_record'))) {
    return 'lcov'
  }

  // JSON formats
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>
      if ('total' in parsed && typeof parsed['total'] === 'object' && parsed['total'] !== null) {
        const total = parsed['total'] as Record<string, unknown>
        if ('lines' in total) return 'istanbul-summary'
      }
      // istanbul-final: file paths as keys with path/s/b/f properties
      const keys = Object.keys(parsed)
      if (keys.length > 0) {
        const firstKey = keys[0]
        if (firstKey !== undefined) {
          const firstVal = parsed[firstKey]
          if (typeof firstVal === 'object' && firstVal !== null && 'path' in firstVal && 's' in firstVal) {
            return 'istanbul-final'
          }
        }
      }
    } catch {
      // not valid JSON
    }
  }

  throw new Error(
    `[tuimon] Could not detect coverage format for ${filePath}. ` +
    'Supported formats: Istanbul/NYC JSON (coverage-summary.json, coverage-final.json), lcov (.info), JUnit XML.',
  )
}

// ─── Parsers ─────────────────────────────────────────────────────────────────

function parseIstanbulSummary(content: string): Record<string, unknown> {
  const report = JSON.parse(content) as IstanbulSummaryReport
  const totalEntry = report['total']
  if (totalEntry === undefined) {
    throw new Error('[tuimon] Invalid coverage-summary.json: missing "total" key.')
  }

  const totalCoverage = Math.round(totalEntry.lines.pct * 100) / 100
  const coveredLines = totalEntry.lines.covered
  const uncoveredLines = totalEntry.lines.total - totalEntry.lines.covered

  const fileEntries: Array<{ name: string; pct: number; branchPct: number; fnPct: number }> = []
  for (const [key, value] of Object.entries(report)) {
    if (key === 'total') continue
    fileEntries.push({
      name: shortenPath(key),
      pct: value.lines.pct,
      branchPct: value.branches.pct,
      fnPct: value.functions.pct,
    })
  }

  // Sort worst first
  fileEntries.sort((a, b) => a.pct - b.pct)

  const fileList = {
    columns: ['File', 'Lines%', 'Branches%', 'Functions%'],
    rows: fileEntries.map((f) => [
      f.name,
      `${f.pct.toFixed(1)}%`,
      `${f.branchPct.toFixed(1)}%`,
      `${f.fnPct.toFixed(1)}%`,
    ]),
  }

  const coverageDist = buildDistribution(fileEntries.map((f) => f.pct))
  const lowCoverage = buildLowCoverageEntries(fileEntries)

  return {
    totalCoverage,
    totalFiles: fileEntries.length,
    coveredLines,
    uncoveredLines,
    fileList,
    coverageDist,
    lowCoverage,
  }
}

function parseIstanbulFinal(content: string): Record<string, unknown> {
  const report = JSON.parse(content) as Record<string, IstanbulFinalEntry>

  let totalStatements = 0
  let totalCoveredStatements = 0
  const fileEntries: Array<{ name: string; pct: number; branchPct: number; fnPct: number }> = []

  for (const [, entry] of Object.entries(report)) {
    const stmtKeys = Object.keys(entry.s)
    const stmtTotal = stmtKeys.length
    const stmtCovered = stmtKeys.filter((k) => (entry.s[k] ?? 0) > 0).length

    const fnKeys = Object.keys(entry.f)
    const fnTotal = fnKeys.length
    const fnCovered = fnKeys.filter((k) => (entry.f[k] ?? 0) > 0).length

    const branchKeys = Object.keys(entry.b)
    let branchTotal = 0
    let branchCovered = 0
    for (const k of branchKeys) {
      const branches = entry.b[k]
      if (branches !== undefined) {
        for (const count of branches) {
          branchTotal++
          if (count > 0) branchCovered++
        }
      }
    }

    totalStatements += stmtTotal
    totalCoveredStatements += stmtCovered

    const pct = stmtTotal > 0 ? (stmtCovered / stmtTotal) * 100 : 100
    const branchPct = branchTotal > 0 ? (branchCovered / branchTotal) * 100 : 100
    const fnPct = fnTotal > 0 ? (fnCovered / fnTotal) * 100 : 100

    fileEntries.push({
      name: shortenPath(entry.path),
      pct: Math.round(pct * 10) / 10,
      branchPct: Math.round(branchPct * 10) / 10,
      fnPct: Math.round(fnPct * 10) / 10,
    })
  }

  fileEntries.sort((a, b) => a.pct - b.pct)

  const totalCoverage = totalStatements > 0
    ? Math.round((totalCoveredStatements / totalStatements) * 10000) / 100
    : 0

  const fileList = {
    columns: ['File', 'Lines%', 'Branches%', 'Functions%'],
    rows: fileEntries.map((f) => [
      f.name,
      `${f.pct.toFixed(1)}%`,
      `${f.branchPct.toFixed(1)}%`,
      `${f.fnPct.toFixed(1)}%`,
    ]),
  }

  const coverageDist = buildDistribution(fileEntries.map((f) => f.pct))
  const lowCoverage = buildLowCoverageEntries(fileEntries)

  return {
    totalCoverage,
    totalFiles: fileEntries.length,
    coveredLines: totalCoveredStatements,
    uncoveredLines: totalStatements - totalCoveredStatements,
    fileList,
    coverageDist,
    lowCoverage,
  }
}

function parseLcov(content: string): Record<string, unknown> {
  const entries: LcovFileEntry[] = []
  let currentFile: string | undefined
  let linesFound = 0
  let linesHit = 0

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('SF:')) {
      currentFile = trimmed.slice(3)
      linesFound = 0
      linesHit = 0
    } else if (trimmed.startsWith('LF:')) {
      linesFound = parseInt(trimmed.slice(3), 10) || 0
    } else if (trimmed.startsWith('LH:')) {
      linesHit = parseInt(trimmed.slice(3), 10) || 0
    } else if (trimmed === 'end_of_record' && currentFile !== undefined) {
      entries.push({ file: currentFile, linesFound, linesHit })
      currentFile = undefined
    }
  }

  let totalFound = 0
  let totalHit = 0
  const fileEntries: Array<{ name: string; pct: number }> = []

  for (const entry of entries) {
    totalFound += entry.linesFound
    totalHit += entry.linesHit
    const pct = entry.linesFound > 0 ? (entry.linesHit / entry.linesFound) * 100 : 100
    fileEntries.push({
      name: shortenPath(entry.file),
      pct: Math.round(pct * 10) / 10,
    })
  }

  fileEntries.sort((a, b) => a.pct - b.pct)

  const totalCoverage = totalFound > 0
    ? Math.round((totalHit / totalFound) * 10000) / 100
    : 0

  const fileList = {
    columns: ['File', 'Lines%', 'Branches%', 'Functions%'],
    rows: fileEntries.map((f) => [f.name, `${f.pct.toFixed(1)}%`, 'N/A', 'N/A']),
  }

  const coverageDist = buildDistribution(fileEntries.map((f) => f.pct))
  const lowCoverage = buildLowCoverageEntries(fileEntries)

  return {
    totalCoverage,
    totalFiles: fileEntries.length,
    coveredLines: totalHit,
    uncoveredLines: totalFound - totalHit,
    fileList,
    coverageDist,
    lowCoverage,
  }
}

function parseJunit(content: string): { layout: LayoutConfig; result: Record<string, unknown> } {
  const testCases: JUnitTestCase[] = []

  const caseRegex = /<testcase\s+([^>]*)(?:\/>|>([\s\S]*?)<\/testcase>)/g
  let match: RegExpExecArray | null

  while ((match = caseRegex.exec(content)) !== null) {
    const attrs = match[1] ?? ''
    const body = match[2] ?? ''

    const nameMatch = attrs.match(/name="([^"]*)"/)
    const classMatch = attrs.match(/classname="([^"]*)"/)
    const timeMatch = attrs.match(/time="([^"]*)"/)

    const name = nameMatch !== null ? (nameMatch[1] ?? '') : ''
    const classname = classMatch !== null ? (classMatch[1] ?? '') : ''
    const time = timeMatch !== null ? parseFloat(timeMatch[1] ?? '0') : 0

    const hasFail = body.includes('<failure') || body.includes('<error')
    testCases.push({
      name,
      classname,
      time,
      status: hasFail ? 'fail' : 'pass',
    })
  }

  const totalTests = testCases.length
  const passed = testCases.filter((t) => t.status === 'pass').length
  const failed = totalTests - passed
  const totalTime = testCases.reduce((sum, t) => sum + t.time, 0)

  const fileList = {
    columns: ['Name', 'Class', 'Time', 'Status'],
    rows: testCases.map((t) => [
      t.name,
      t.classname,
      `${t.time.toFixed(3)}s`,
      t.status === 'pass' ? 'PASS' : 'FAIL',
    ]),
  }

  const coverageDist: Record<string, number> = {
    Passed: passed,
    Failed: failed,
  }

  const lowCoverage = testCases
    .filter((t) => t.status === 'fail')
    .map((t) => ({
      text: `FAIL: ${t.classname} > ${t.name}`,
      type: 'error' as const,
    }))

  return {
    layout: junitLayout,
    result: {
      totalCoverage: totalTests,
      totalFiles: passed,
      coveredLines: failed,
      uncoveredLines: `${totalTime.toFixed(2)}s`,
      fileList,
      coverageDist,
      lowCoverage,
    },
  }
}

// ─── Preset ──────────────────────────────────────────────────────────────────

export function coveragePreset(filePath: string): PresetResult {
  const resolvedPath = resolve(filePath)

  let content: string
  try {
    content = readFileSync(resolvedPath, 'utf-8')
  } catch {
    throw new Error(
      `[tuimon] Could not read coverage file: ${resolvedPath}. Make sure the file exists and is readable.`,
    )
  }

  const format = detectFormat(content, resolvedPath)

  if (format === 'junit') {
    const { layout, result } = parseJunit(content)
    return {
      layout,
      data: () => result,
    }
  }

  const data = (): Record<string, unknown> => {
    switch (format) {
      case 'istanbul-summary':
        return parseIstanbulSummary(content)
      case 'istanbul-final':
        return parseIstanbulFinal(content)
      case 'lcov':
        return parseLcov(content)
    }
  }

  return { layout: coverageLayout, data }
}
