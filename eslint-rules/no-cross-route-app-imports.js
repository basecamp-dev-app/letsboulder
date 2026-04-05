import path from 'node:path'

function normalizePath(value) {
  return value.replace(/\\/g, '/').replace(/\/+/g, '/')
}

function isEntrypointFile(pathname) {
  const normalized = normalizePath(pathname).replace(/\.[^.]+$/, '')
  const filename = normalized.split('/').at(-1)
  return filename === 'page' || filename === 'layout' || filename === 'loading' || filename === 'error' || filename === 'not-found' || filename === 'template' || filename === 'route'
}

function getRouteScopeFromFile(filename) {
  const normalized = normalizePath(path.relative(process.cwd(), filename))
  if (!normalized.startsWith('app/')) return null

  const withoutExtension = normalized.replace(/\.[^.]+$/, '')
  const segments = withoutExtension.split('/')
  if (segments.length < 2) return 'app'

  if (segments.at(-1) === 'page' || segments.at(-1) === 'layout' || segments.at(-1) === 'loading' || segments.at(-1) === 'error' || segments.at(-1) === 'not-found' || segments.at(-1) === 'template') {
    segments.pop()
  }

  if (segments.at(-1) === 'route') {
    return segments.slice(0, -1).join('/')
  }

  const componentIndex = segments.indexOf('components')
  if (componentIndex !== -1) {
    return segments.slice(0, componentIndex).join('/')
  }

  return segments.slice(0, -1).join('/')
}

function getRouteScopeFromImport(importPath) {
  if (!importPath.startsWith('@/app/')) return null

  const normalized = normalizePath(importPath.slice(2)).replace(/\.[^.]+$/, '')
  const segments = normalized.split('/')
  if (segments.length < 2) return 'app'

  if (segments.at(-1) === 'page' || segments.at(-1) === 'layout' || segments.at(-1) === 'loading' || segments.at(-1) === 'error' || segments.at(-1) === 'not-found' || segments.at(-1) === 'template') {
    segments.pop()
  }

  if (segments.at(-1) === 'route') {
    return segments.slice(0, -1).join('/')
  }

  const componentIndex = segments.indexOf('components')
  if (componentIndex !== -1) {
    return segments.slice(0, componentIndex).join('/')
  }

  return segments.slice(0, -1).join('/')
}

function isSameOrNestedScope(sourceScope, importScope) {
  return importScope === sourceScope || importScope.startsWith(`${sourceScope}/`)
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow cross-route imports from app/** while allowing same-subtree route-local imports',
    },
    schema: [],
    messages: {
      crossRouteImport:
        'Do not import from {{importPath}} across route subtrees. Move reusable code into features/**, lib/**, or components/**.',
      aliasImportWithinApp:
        'Do not import {{importPath}} via @/app/** inside app/**. Use a route-local relative import or move reusable code into features/**, lib/**, or components/**.',
    },
  },
  create(context) {
    const filename = context.getFilename()
    const sourceScope = getRouteScopeFromFile(filename)

    if (!sourceScope) {
      return {}
    }

    return {
      ImportDeclaration(node) {
        if (typeof node.source.value !== 'string') return

        const importPath = node.source.value
        const importScope = getRouteScopeFromImport(importPath)
        if (!importScope) return

        if (importPath.startsWith('@/app/') && !isEntrypointFile(importPath.slice(2))) {
          context.report({
            node,
            messageId: 'aliasImportWithinApp',
            data: { importPath },
          })
          return
        }

        if (!isSameOrNestedScope(sourceScope, importScope)) {
          context.report({
            node,
            messageId: 'crossRouteImport',
            data: { importPath },
          })
        }
      },
    }
  },
}
