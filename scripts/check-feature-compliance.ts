import { readdirSync } from 'node:fs'
import { join } from 'node:path'

const REQUIRED_DIRS = ['components', 'hooks', 'lib', 'server', 'types'] as const
const FEATURES_DIR = join(process.cwd(), 'features')

interface FeatureCheck {
  name: string
  rootDirs: Record<string, boolean>
  effectiveDirs: Record<string, boolean>
  compliant: boolean
}

function collectDirectoryNames(root: string): Set<string> {
  const discovered = new Set<string>()
  const stack = [root]

  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) continue

    const entries = readdirSync(current, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      discovered.add(entry.name)
      stack.push(join(current, entry.name))
    }
  }

  return discovered
}

function collectRootDirectoryNames(root: string): Set<string> {
  return new Set(
    readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name),
  )
}

function checkFeatures(): FeatureCheck[] {
  const entries = readdirSync(FEATURES_DIR, { withFileTypes: true })
  const features = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()

  return features.map((name) => {
    const featurePath = join(FEATURES_DIR, name)
    const rootDirs: Record<string, boolean> = {}
    const effectiveDirs: Record<string, boolean> = {}
    const rootDirNames = collectRootDirectoryNames(featurePath)
    const discoveredDirNames = collectDirectoryNames(featurePath)

    for (const dir of REQUIRED_DIRS) {
      rootDirs[dir] = rootDirNames.has(dir)
      effectiveDirs[dir] = rootDirs[dir] || discoveredDirNames.has(dir)
    }

    return {
      name,
      rootDirs,
      effectiveDirs,
      compliant: REQUIRED_DIRS.every((d) => effectiveDirs[d]),
    }
  })
}

function printTable(results: FeatureCheck[]): void {
  const header = `| Feature | ${REQUIRED_DIRS.map((dir) => `${dir} (root/effective)`).join(' | ')} | Status |`
  const separator = `|${'-'.repeat(20)}|${REQUIRED_DIRS.map(() => ':---------------------:').join('|')}|--------|`

  console.log(header)
  console.log(separator)

  for (const r of results) {
    const marks = REQUIRED_DIRS
      .map((d) => `${r.rootDirs[d] ? '✓' : '✗'}/${r.effectiveDirs[d] ? '✓' : '✗'}`)
      .join(' | ')
    const status = r.compliant ? 'Compliant' : 'Non-compliant'
    console.log(`| ${r.name} | ${marks} | ${status} |`)
  }

  const compliantCount = results.filter((r) => r.compliant).length
  console.log(`\n${compliantCount}/${results.length} features compliant`)

  if (compliantCount < results.length) {
    const nonCompliant = results.filter((r) => !r.compliant)
    console.log('\nNon-compliant features:')
    for (const r of nonCompliant) {
      const missing = REQUIRED_DIRS.filter((d) => !r.effectiveDirs[d]).join(', ')
      console.log(`  - ${r.name}: missing ${missing}`)
    }
    process.exit(1)
  }

  const advisoryResults = results
    .map((r) => ({
      name: r.name,
      nestedOnly: REQUIRED_DIRS.filter((d) => !r.rootDirs[d] && r.effectiveDirs[d]),
    }))
    .filter((r) => r.nestedOnly.length > 0)

  if (advisoryResults.length > 0) {
    console.log('\nAdvisory: nested-only directories detected')
    for (const r of advisoryResults) {
      console.log(`  - ${r.name}: ${r.nestedOnly.join(', ')} satisfied via nested sub-features`) 
    }
  }
}

printTable(checkFeatures())
