import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const TEMPLATE_DIRS = ['components', 'hooks', 'lib', 'server', 'types'] as const
const FEATURES_DIR = join(process.cwd(), 'features')

export interface FeatureCheck {
  name: string
  rootDirs: Record<string, boolean>
  effectiveDirs: Record<string, boolean>
  fullTemplate: boolean
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

export function checkFeatures(featuresDir = FEATURES_DIR): FeatureCheck[] {
  const entries = readdirSync(featuresDir, { withFileTypes: true })
  const features = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()

  return features.map((name) => {
    const featurePath = join(featuresDir, name)
    const rootDirs: Record<string, boolean> = {}
    const effectiveDirs: Record<string, boolean> = {}
    const rootDirNames = collectRootDirectoryNames(featurePath)
    const discoveredDirNames = collectDirectoryNames(featurePath)

    for (const dir of TEMPLATE_DIRS) {
      rootDirs[dir] = rootDirNames.has(dir)
      effectiveDirs[dir] = rootDirs[dir] || discoveredDirNames.has(dir)
    }

    return {
      name,
      rootDirs,
      effectiveDirs,
      fullTemplate: TEMPLATE_DIRS.every((d) => effectiveDirs[d]),
    }
  })
}

export function formatFeatureReport(results: FeatureCheck[]): string {
  const lines = [
    'Feature layout advisory',
    'Standard template directories are optional; create only the directories a feature uses.',
    'Marks show root/tree presence. Nested sub-features count toward tree coverage.',
    '',
  ]
  const header = `| Feature | ${TEMPLATE_DIRS.map((dir) => `${dir} (root/tree)`).join(' | ')} | Template coverage |`
  const separator = `|${'-'.repeat(20)}|${TEMPLATE_DIRS.map(() => ':------------------:').join('|')}|-------------------|`

  lines.push(header, separator)

  for (const r of results) {
    const marks = TEMPLATE_DIRS
      .map((d) => `${r.rootDirs[d] ? '✓' : '✗'}/${r.effectiveDirs[d] ? '✓' : '✗'}`)
      .join(' | ')
    const status = r.fullTemplate ? 'Full template' : 'Partial template'
    lines.push(`| ${r.name} | ${marks} | ${status} |`)
  }

  const fullTemplateCount = results.filter((r) => r.fullTemplate).length
  lines.push('', `${fullTemplateCount}/${results.length} features use the full template`)

  if (fullTemplateCount < results.length) {
    const partialTemplates = results.filter((r) => !r.fullTemplate)
    lines.push('', 'Partial templates (advisory only; no directories need to be added):')
    for (const r of partialTemplates) {
      const notPresent = TEMPLATE_DIRS.filter((d) => !r.effectiveDirs[d]).join(', ')
      lines.push(`  - ${r.name}: not present in feature tree: ${notPresent}`)
    }
  }

  const advisoryResults = results
    .map((r) => ({
      name: r.name,
      nestedOnly: TEMPLATE_DIRS.filter((d) => !r.rootDirs[d] && r.effectiveDirs[d]),
    }))
    .filter((r) => r.nestedOnly.length > 0)

  if (advisoryResults.length > 0) {
    lines.push('', 'Nested sub-feature coverage:')
    for (const r of advisoryResults) {
      lines.push(`  - ${r.name}: ${r.nestedOnly.join(', ')} supplied by nested sub-features`)
    }
  }

  return lines.join('\n')
}

const isDirectRun = process.argv[1]
  ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  : false

if (isDirectRun) {
  console.log(formatFeatureReport(checkFeatures()))
}
