import { readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import type { LayoutConfig } from '../../layout/types.js'
import type { PresetResult } from './types.js'

interface LockPackageV3 {
  version?: string
  dev?: boolean
  dependencies?: Record<string, string>
  requires?: Record<string, string>
}

interface LockFileV3 {
  lockfileVersion?: number
  packages?: Record<string, LockPackageV3>
}

interface LockDepV2 {
  version?: string
  dev?: boolean
  requires?: Record<string, string>
  dependencies?: Record<string, LockDepV2>
}

interface LockFileV2 {
  lockfileVersion?: number
  dependencies?: Record<string, LockDepV2>
}

interface PackageJson {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

function extractPackageName(path: string): string {
  // node_modules/@scope/name or node_modules/name
  const match = path.match(/node_modules\/(.+)$/)
  if (match !== null) return match[1] ?? path
  return path
}

function collectDepsV3(
  packages: Record<string, LockPackageV3>,
  pkgJson: PackageJson,
): {
  allDeps: Array<{ name: string; version: string; dev: boolean }>
  dependedOnCount: Map<string, number>
  versionMap: Map<string, Set<string>>
} {
  const allDeps: Array<{ name: string; version: string; dev: boolean }> = []
  const dependedOnCount = new Map<string, number>()
  const versionMap = new Map<string, Set<string>>()
  const devDepNames = new Set(Object.keys(pkgJson.devDependencies ?? {}))

  for (const [path, entry] of Object.entries(packages)) {
    if (path === '') continue // root package
    const name = extractPackageName(path)
    const version = entry.version ?? 'unknown'
    const isDev = entry.dev === true || devDepNames.has(name)

    allDeps.push({ name, version, dev: isDev })

    const versions = versionMap.get(name) ?? new Set<string>()
    versions.add(version)
    versionMap.set(name, versions)

    // Count what this package depends on
    const deps = { ...entry.dependencies, ...entry.requires }
    for (const depName of Object.keys(deps)) {
      dependedOnCount.set(depName, (dependedOnCount.get(depName) ?? 0) + 1)
    }
  }

  return { allDeps, dependedOnCount, versionMap }
}

function collectDepsV2(
  dependencies: Record<string, LockDepV2>,
  pkgJson: PackageJson,
): {
  allDeps: Array<{ name: string; version: string; dev: boolean }>
  dependedOnCount: Map<string, number>
  versionMap: Map<string, Set<string>>
} {
  const allDeps: Array<{ name: string; version: string; dev: boolean }> = []
  const dependedOnCount = new Map<string, number>()
  const versionMap = new Map<string, Set<string>>()
  const devDepNames = new Set(Object.keys(pkgJson.devDependencies ?? {}))

  function walk(deps: Record<string, LockDepV2>, parentName?: string): void {
    for (const [name, entry] of Object.entries(deps)) {
      const version = entry.version ?? 'unknown'
      const isDev = entry.dev === true || devDepNames.has(name)

      allDeps.push({ name, version, dev: isDev })

      const versions = versionMap.get(name) ?? new Set<string>()
      versions.add(version)
      versionMap.set(name, versions)

      if (parentName !== undefined) {
        dependedOnCount.set(name, (dependedOnCount.get(name) ?? 0) + 1)
      }

      // Count requires
      if (entry.requires !== undefined) {
        for (const depName of Object.keys(entry.requires)) {
          dependedOnCount.set(depName, (dependedOnCount.get(depName) ?? 0) + 1)
        }
      }

      // Nested dependencies
      if (entry.dependencies !== undefined) {
        walk(entry.dependencies, name)
      }
    }
  }

  walk(dependencies)
  return { allDeps, dependedOnCount, versionMap }
}

export function depsPreset(filePath: string): PresetResult {
  const layout: LayoutConfig = {
    title: 'Dependencies',
    stats: [
      { id: 'totalDeps', label: 'Total Dependencies', type: 'stat' },
      { id: 'directDeps', label: 'Direct', type: 'stat' },
      { id: 'devDeps', label: 'Dev Dependencies', type: 'stat' },
      { id: 'duplicates', label: 'Duplicates', type: 'stat' },
    ],
    panels: [
      { id: 'depList', label: 'All Dependencies', type: 'table', span: 2 },
      { id: 'topByDeps', label: 'Most Depended On', type: 'bar' },
      { id: 'versionConflicts', label: 'Version Conflicts', type: 'event-log' },
    ],
  }

  const data = (): Record<string, unknown> => {
    let lockContent: string
    try {
      lockContent = readFileSync(filePath, 'utf-8')
    } catch {
      throw new Error(`[tuimon] Could not read lock file: ${filePath}. Make sure the file exists and is readable.`)
    }

    let lockData: LockFileV2 & LockFileV3
    try {
      lockData = JSON.parse(lockContent) as LockFileV2 & LockFileV3
    } catch {
      throw new Error(`[tuimon] Could not parse lock file: ${filePath}. Make sure it is valid JSON.`)
    }

    // Read package.json from same directory
    const dir = dirname(filePath)
    const pkgJsonPath = join(dir, 'package.json')
    let pkgJson: PackageJson
    try {
      pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8')) as PackageJson
    } catch {
      throw new Error(`[tuimon] Could not read package.json at ${pkgJsonPath}. Make sure it exists alongside the lock file.`)
    }

    const lockVersion = lockData.lockfileVersion ?? 1
    let allDeps: Array<{ name: string; version: string; dev: boolean }>
    let dependedOnCount: Map<string, number>
    let versionMap: Map<string, Set<string>>

    if (lockVersion >= 3 && lockData.packages !== undefined) {
      const result = collectDepsV3(lockData.packages, pkgJson)
      allDeps = result.allDeps
      dependedOnCount = result.dependedOnCount
      versionMap = result.versionMap
    } else if (lockData.packages !== undefined) {
      // lockfileVersion 2 also has packages
      const result = collectDepsV3(lockData.packages, pkgJson)
      allDeps = result.allDeps
      dependedOnCount = result.dependedOnCount
      versionMap = result.versionMap
    } else if (lockData.dependencies !== undefined) {
      const result = collectDepsV2(lockData.dependencies, pkgJson)
      allDeps = result.allDeps
      dependedOnCount = result.dependedOnCount
      versionMap = result.versionMap
    } else {
      throw new Error(`[tuimon] Unsupported lock file format in ${filePath}. Expected lockfileVersion 2 or 3 with packages or dependencies.`)
    }

    // Unique package names
    const uniqueNames = new Set(allDeps.map((d) => d.name))
    const totalDeps = uniqueNames.size

    // Direct deps count
    const directDepNames = [
      ...Object.keys(pkgJson.dependencies ?? {}),
      ...Object.keys(pkgJson.devDependencies ?? {}),
    ]
    const directDeps = directDepNames.length

    // Dev deps count
    const devDeps = Object.keys(pkgJson.devDependencies ?? {}).length

    // Duplicates: packages with multiple versions
    let duplicates = 0
    for (const [, versions] of versionMap) {
      if (versions.size > 1) duplicates++
    }

    // Deduplicate for table — keep unique name+version combos
    const seen = new Set<string>()
    const uniqueDeps: Array<{ name: string; version: string; dev: boolean }> = []
    const sorted = [...allDeps].sort((a, b) => a.name.localeCompare(b.name))
    for (const dep of sorted) {
      const key = `${dep.name}@${dep.version}`
      if (!seen.has(key)) {
        seen.add(key)
        uniqueDeps.push(dep)
      }
    }

    // Table data
    const depList = {
      columns: ['Name', 'Version', 'Dev'],
      rows: uniqueDeps.map((d) => [d.name, d.version, d.dev ? 'Yes' : 'No']),
    }

    // Top by dependents (most depended on)
    const sortedByCount = [...dependedOnCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
    const topByDeps: Record<string, number> = {}
    for (const [name, count] of sortedByCount) {
      topByDeps[name] = count
    }

    // Version conflicts
    const versionConflicts: Array<{ text: string; type: 'warning' }> = []
    for (const [name, versions] of versionMap) {
      if (versions.size > 1) {
        const versionList = [...versions].join(', ')
        versionConflicts.push({
          text: `${name}: ${versionList}`,
          type: 'warning',
        })
      }
    }

    return {
      totalDeps,
      directDeps,
      devDeps,
      duplicates,
      depList,
      topByDeps,
      versionConflicts,
    }
  }

  return { layout, data }
}
