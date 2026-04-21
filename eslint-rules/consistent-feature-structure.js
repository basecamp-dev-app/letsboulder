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
        'Create them (with an index.ts barrel export if empty). See docs/feature-structure.md.',
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

        const missing = REQUIRED_DIRS.filter(
          (dir) => !fs.existsSync(path.join(featureRoot, dir)),
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
