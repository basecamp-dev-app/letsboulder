import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkArchitecture, type ArchitectureViolation, type SourceFile } from './check-architecture-rules'

// Replaced with this commit's SHA after the baseline snapshot is committed.
const ARCHITECTURE_BASELINE = 'HEAD'
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
      if (entry.isFile() && /\.tsx?$/.test(entry.name)) paths.push(path)
    }
  }

  return paths
}

function sourceAtRevision(revision: string, filePath: string): string | null {
  try {
    return execFileSync('git', ['show', `${revision}:${filePath}`], { encoding: 'utf8' })
  } catch {
    return null
  }
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
const baselineFiles = files.flatMap(file => {
  const source = sourceAtRevision(ARCHITECTURE_BASELINE, file.path)
  return source === null ? [] : [{ path: file.path, source }]
})
const baselineKeys = new Set(checkArchitecture(baselineFiles).map(violation => violation.key))
const newViolations = checkArchitecture(files).filter(violation => !baselineKeys.has(violation.key))

if (newViolations.length > 0) {
  printViolations('Architecture boundary violations found:', newViolations)
  process.exit(1)
}

console.log(`Architecture checks passed. ${baselineKeys.size} baseline violation(s) remain.`)
