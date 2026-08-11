import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import baselineManifest from './architecture-baseline.json'
import {
  checkArchitecture,
  compareArchitectureBaseline,
  isArchitectureSourcePath,
  type ArchitectureViolation,
  type SourceFile,
} from './check-architecture-rules'

const SOURCE_ROOTS = ['app', 'components', 'features']

function collectSourcePaths(root: string): string[] {
  const paths: string[] = []
  const stack = [root]

  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) continue

    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) stack.push(path)
      if (entry.isFile() && isArchitectureSourcePath(entry.name)) paths.push(path)
    }
  }

  return paths
}

function printViolations(title: string, items: ArchitectureViolation[]): void {
  if (items.length === 0) return
  console.error(title)
  for (const violation of items) {
    console.error(`- ${violation.filePath}:${violation.line} ${violation.message}`)
  }
}

const files: SourceFile[] = SOURCE_ROOTS.flatMap(collectSourcePaths).map(path => ({
  path,
  source: readFileSync(path, 'utf8'),
}))
const violations = checkArchitecture(files)
const baseline = compareArchitectureBaseline(violations, baselineManifest.violations)

printViolations('Architecture boundary violations found:', baseline.unexpected)
if (baseline.resolved.length > 0) {
  console.error('Resolved architecture baseline entries must be removed from scripts/architecture-baseline.json:')
  for (const key of baseline.resolved) console.error(`- ${key}`)
}

if (baseline.unexpected.length > 0 || baseline.resolved.length > 0) process.exit(1)
console.log(`Architecture checks passed. ${baselineManifest.violations.length} explicit baseline violation(s) remain.`)
