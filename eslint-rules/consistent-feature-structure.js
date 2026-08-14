/**
 * ESLint rule for the advisory feature directory template.
 *
 * Features only need the template directories they use. Partial template
 * coverage produces one advisory per top-level feature.
 */

import fs from 'node:fs'
import path from 'node:path'

const TEMPLATE_DIRS = ['components', 'hooks', 'lib', 'server', 'types']
const SOURCE_FILE_PATTERN = /\.(?:[cm]?[jt]sx?)$/
const featureInspectionCache = new Map()

function locateFeature(filename) {
  const absoluteFilename = path.resolve(filename)
  const projectFeaturesRoot = path.resolve(process.cwd(), 'features')
  const projectRelativePath = path.relative(projectFeaturesRoot, absoluteFilename)

  if (!projectRelativePath.startsWith('..') && !path.isAbsolute(projectRelativePath)) {
    const [featureName] = projectRelativePath.split(path.sep)
    if (!featureName) return undefined
    return {
      absoluteFilename,
      featureName,
      featureRoot: path.join(projectFeaturesRoot, featureName),
    }
  }

  const marker = `${path.sep}features${path.sep}`
  const markerIndex = absoluteFilename.indexOf(marker)
  if (markerIndex === -1) return undefined

  const featureNameStart = markerIndex + marker.length
  const featureNameEnd = absoluteFilename.indexOf(path.sep, featureNameStart)
  if (featureNameEnd === -1) return undefined

  const featureName = absoluteFilename.slice(featureNameStart, featureNameEnd)
  return {
    absoluteFilename,
    featureName,
    featureRoot: absoluteFilename.slice(0, featureNameEnd),
  }
}

function inspectFeatureTree(root) {
  const cached = featureInspectionCache.get(root)
  if (cached) return cached

  const discovered = new Set()
  const sourceFiles = []
  const stack = [root]

  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) continue

    const entries = fs.readdirSync(current, { withFileTypes: true })
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        discovered.add(entry.name)
        stack.push(entryPath)
      } else if (entry.isFile() && SOURCE_FILE_PATTERN.test(entry.name)) {
        sourceFiles.push(path.resolve(entryPath))
      }
    }
  }

  sourceFiles.sort()
  const inspection = { discovered, reportTarget: sourceFiles[0] }
  featureInspectionCache.set(root, inspection)
  return inspection
}

const consistentFeatureStructureRule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Report advisory feature template coverage',
      category: 'Best Practices',
      recommended: false,
    },
    schema: [],
    messages: {
      partialTemplate:
        'Feature "{{feature}}" uses a partial template (not present: {{notPresent}}). ' +
        'Feature layout is advisory; create only the directories the feature uses. See docs/feature-structure.md.',
    },
  },
  create(context) {
    return {
      Program(node) {
        const physicalFilename = context.getPhysicalFilename?.()
        const filename = physicalFilename && physicalFilename !== '<text>'
          ? physicalFilename
          : context.getFilename()
        const feature = locateFeature(filename)
        if (!feature) return

        const { absoluteFilename, featureName, featureRoot } = feature
        if (!fs.existsSync(featureRoot)) return

        const { discovered, reportTarget } = inspectFeatureTree(featureRoot)
        if (absoluteFilename !== reportTarget) return

        const notPresent = TEMPLATE_DIRS.filter(
          (dir) => !fs.existsSync(path.join(featureRoot, dir)) && !discovered.has(dir),
        )

        if (notPresent.length > 0) {
          context.report({
            node,
            messageId: 'partialTemplate',
            data: {
              feature: featureName,
              notPresent: notPresent.join(', '),
            },
          })
        }
      },
    }
  },
}

export default consistentFeatureStructureRule
