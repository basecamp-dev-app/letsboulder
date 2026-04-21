/*
 * ESLint rule to restrict getAdminClient imports to audited paths.
 *
 * getAdminClient() bypasses RLS - only allow from explicitly audited modules:
 * - app/api/ (API routes - controlled entry points)
 * - features/submissions/server/ (submission operations)
 * - features/crags/server/ (crag image operations)
 * - lib/offline/ (offline pack building)
 * - tests/ (test files)
 */

const AUDITED_PATHS = [
  'app/api/',
  'features/submissions/server/',
  'features/crags/server/',
  'lib/offline/',
  'tests/',
]

const AUDITED_IMPORTS = [
  '@/lib/supabase-server',
  '@/lib/offline/build-climb-pack-helpers',
]

const noServiceRoleImportRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Restrict getAdminClient to audited server paths only',
    },
    schema: [],
    messages: {
      serviceRoleImport:
        'getAdminClient() bypasses RLS. Import from audited paths only: ' +
        'app/api/**, features/submissions/server/**, features/crags/server/**, lib/offline/**, tests/**',
    },
  },
  create(context) {
    const filename = context.getFilename()
    const isAuditedPath = AUDITED_PATHS.some((path) => filename.includes(path))

    if (isAuditedPath) return {}

    return {
      ImportDeclaration(node) {
        if (typeof node.source.value !== 'string') return

        const importPath = node.source.value
        if (!AUDITED_IMPORTS.includes(importPath)) return

        const specifiers = node.specifiers || []
        const hasAdminClientImport = specifiers.some(
          (spec) =>
            spec.type === 'ImportSpecifier' &&
            spec.imported &&
            spec.imported.name === 'getAdminClient'
        )

        if (hasAdminClientImport) {
          context.report({
            node,
            messageId: 'serviceRoleImport',
          })
        }
      },
    }
  },
}

export default noServiceRoleImportRule
