import { readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const REQUIRED_DIRS = ['components', 'hooks', 'lib', 'server', 'types'] as const
const FEATURES_DIR = join(process.cwd(), 'features')

interface FeatureCheck {
  name: string
  dirs: Record<string, boolean>
  compliant: boolean
}

function checkFeatures(): FeatureCheck[] {
  const entries = readdirSync(FEATURES_DIR, { withFileTypes: true })
  const features = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()

  return features.map((name) => {
    const featurePath = join(FEATURES_DIR, name)
    const dirs: Record<string, boolean> = {}
    for (const dir of REQUIRED_DIRS) {
      dirs[dir] = existsSync(join(featurePath, dir))
    }
    return {
      name,
      dirs,
      compliant: REQUIRED_DIRS.every((d) => dirs[d]),
    }
  })
}

function printTable(results: FeatureCheck[]): void {
  const header = `| Feature | ${REQUIRED_DIRS.join(' | ')} | Status |`
  const separator = `|${'-'.repeat(20)}|${REQUIRED_DIRS.map(() => ':----------:').join('|')}|--------|`

  console.log(header)
  console.log(separator)

  for (const r of results) {
    const marks = REQUIRED_DIRS.map((d) => (r.dirs[d] ? '✓' : '✗')).join(' | ')
    const status = r.compliant ? 'Compliant' : 'Non-compliant'
    console.log(`| ${r.name} | ${marks} | ${status} |`)
  }

  const compliantCount = results.filter((r) => r.compliant).length
  console.log(`\n${compliantCount}/${results.length} features compliant`)

  if (compliantCount < results.length) {
    const nonCompliant = results.filter((r) => !r.compliant)
    console.log('\nNon-compliant features:')
    for (const r of nonCompliant) {
      const missing = REQUIRED_DIRS.filter((d) => !r.dirs[d]).join(', ')
      console.log(`  - ${r.name}: missing ${missing}`)
    }
    process.exit(1)
  }
}

printTable(checkFeatures())
