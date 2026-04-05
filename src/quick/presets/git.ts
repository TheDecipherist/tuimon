import { execSync } from 'node:child_process'
import type { LayoutConfig } from '../../layout/types.js'
import type { PresetResult } from './types.js'

function execGit(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout: 30_000, stdio: ['pipe', 'pipe', 'pipe'] })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('not a git repository') || msg.includes('Not a git repository')) {
      throw new Error('[tuimon] Not a git repository. Run this command from inside a git repo.')
    }
    if (msg.includes('ENOENT') || msg.includes('not found') || msg.includes('command not found')) {
      throw new Error('[tuimon] Git not found. Make sure git is installed.')
    }
    throw err
  }
}

export function gitPreset(): PresetResult {
  // Verify we're in a git repo on init
  try {
    execSync('git rev-parse --is-inside-work-tree', { encoding: 'utf-8', stdio: 'pipe' })
  } catch {
    throw new Error('[tuimon] Not a git repository. Run this command from inside a git repo.')
  }

  const layout: LayoutConfig = {
    title: 'Git',
    stats: [
      { id: 'commits', label: 'Total Commits', type: 'stat' },
      { id: 'contributors', label: 'Contributors', type: 'stat' },
      { id: 'branches', label: 'Branches', type: 'stat' },
      { id: 'filesChanged', label: 'Files Changed (30d)', type: 'stat' },
    ],
    panels: [
      { id: 'frequency', label: 'Commits per Day (30 days)', type: 'bar', span: 2 },
      { id: 'topContributors', label: 'Top Contributors', type: 'bar' },
      { id: 'topFiles', label: 'Most Changed Files', type: 'bar' },
      { id: 'recentCommits', label: 'Recent Commits', type: 'event-log', span: 2 },
    ],
  }

  const data = (): Record<string, unknown> => {
    // Total commits
    const commitCountStr = execGit('git rev-list --count HEAD').trim()
    const commits = parseInt(commitCountStr, 10) || 0

    // Contributors
    const shortlogOutput = execGit('git shortlog -sn --no-merges HEAD')
    const contributorLines = shortlogOutput
      .trim()
      .split('\n')
      .filter((line) => line.trim() !== '')
    const contributorEntries = contributorLines.map((line) => {
      const match = line.trim().match(/^(\d+)\t(.+)$/)
      return match ? { count: parseInt(match[1] ?? '0', 10), name: match[2] ?? 'unknown' } : null
    }).filter((e): e is { count: number; name: string } => e !== null)

    const contributorsCount = contributorEntries.length

    const topContributors: Record<string, number> = {}
    for (const entry of contributorEntries.slice(0, 10)) {
      topContributors[entry.name] = entry.count
    }

    // Branches
    const branchOutput = execGit('git branch --list')
    const branchCount = branchOutput
      .trim()
      .split('\n')
      .filter((line) => line.trim() !== '').length

    // Commits per day (30 days)
    const dateOutput = execGit('git log --since="30 days ago" --format="%ad" --date=short')
    const dates = dateOutput
      .trim()
      .split('\n')
      .filter((line) => line.trim() !== '')
    const frequency: Record<string, number> = {}
    for (const date of dates) {
      const d = date.trim()
      frequency[d] = (frequency[d] ?? 0) + 1
    }

    // Files changed in 30 days
    const filesOutput = execGit('git log --since="30 days ago" --name-only --format=""')
    const allFiles = filesOutput
      .trim()
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => line.trim())

    const fileCounts = new Map<string, number>()
    for (const file of allFiles) {
      fileCounts.set(file, (fileCounts.get(file) ?? 0) + 1)
    }

    const uniqueFilesChanged = fileCounts.size

    // Top 10 most changed files
    const sortedFiles = [...fileCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
    const topFiles: Record<string, number> = {}
    for (const [file, count] of sortedFiles) {
      topFiles[file] = count
    }

    // Recent commits
    const recentOutput = execGit('git log -20 --format="%h %s (%an, %ar)"')
    const recentCommits = recentOutput
      .trim()
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => ({ text: line.trim(), type: 'info' as const }))

    return {
      commits,
      contributors: contributorsCount,
      branches: branchCount,
      filesChanged: uniqueFilesChanged,
      frequency,
      topContributors,
      topFiles,
      recentCommits,
    }
  }

  return { layout, data }
}
