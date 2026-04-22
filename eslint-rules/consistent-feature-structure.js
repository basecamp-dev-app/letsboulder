/**
 * ESLint rule to enforce standard feature directory structure.
 *
 * Every feature under features/ MUST have these subdirectories:
 *   components/, hooks/, lib/, server/, types/
 *
 * Missing directories produce a warning.
 */

import fs from 'node:fs'
import path from 'node:path'

const REQUIRED_DIRS = ['components', 'hooks', 'lib', 'server', 'types']

function collectDirectoryNames(root) {
  const discovered = new Set()
  const stack = [root]

  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) continue

    const entries = fs.readdirSync(current, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      discovered.add(entry.name)
      stack.push(path.join(current, entry.name))
    }
  }

  return discovered
}

const consistentFeatureStructureRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce standard feature directory structure',
      category: 'Best Practices',
      recommended: true,
    },
    schema: [],
    messages: {
      missingDirs:
        'Feature "{{feature}}" is missing required directories: {{missing}}. ' +
        'These directories must exist somewhere in the feature tree. See docs/feature-structure.md.',
    },
  },
  create(context) {
    let hasReported = false

    return {
      Program(node) {
        if (hasReported) return

        const filename = context.getFilename()
        const featuresIndex = filename.indexOf('features/')
        if (featuresIndex === -1) return

        const relPath = filename.slice(featuresIndex)
        const parts = relPath.split('/')
        if (parts.length < 2) return

        const featureName = parts[1]
        if (!featureName || featureName === 'index.ts') return

        const featureRoot = path.join(process.cwd(), 'features', featureName)
        if (!fs.existsSync(featureRoot)) return

        const discoveredDirNames = collectDirectoryNames(featureRoot)

        const missing = REQUIRED_DIRS.filter(
          (dir) => !fs.existsSync(path.join(featureRoot, dir)) && !discoveredDirNames.has(dir),
        )

        if (missing.length > 0) {
          hasReported = true
          context.report({
            node,
            messageId: 'missingDirs',
            data: {
              feature: featureName,
              missing: missing.join(', '),
            },
          })
        }
      },
    }
  },
}

export default consistentFeatureStructureRule
