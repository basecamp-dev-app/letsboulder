import { posix } from 'node:path'
import ts from 'typescript'

export interface SourceFile {
  path: string
  source: string
}

export type ArchitectureRule =
  | 'component-supabase-import'
  | 'app-domain-directory'
  | 'cross-feature-private-import'
  | 'feature-app-import'
  | 'client-server-public-import'
  | 'public-client-server-export'
  | 'public-server-boundary'
  | 'public-actions-target'

export interface ArchitectureViolation {
  rule: ArchitectureRule
  filePath: string
  line: number
  message: string
  key: string
}

export interface ArchitectureBaselineResult {
  unexpected: ArchitectureViolation[]
  resolved: string[]
}

interface ModuleReference {
  specifier: string
  line: number
  typeOnly: boolean
  exportDeclaration: ts.ExportDeclaration | null
}

interface ResolvedModule {
  path: string
  sourceFile: ts.SourceFile
}

const APP_DOMAIN_DIRECTORY_PATTERN = /^app\/(?:.*\/)?(?:actions|hooks|lib|server|store|types)(?:\/|$)/
const ARCHITECTURE_SOURCE_PATTERN = /\.(?:[cm]?js|jsx|[cm]?ts|tsx)$/
const PUBLIC_ENTRYPOINTS = new Set(['public', 'public-client', 'public-actions', 'public-server'])
const RESOLUTION_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']

export function isArchitectureSourcePath(filePath: string): boolean {
  return ARCHITECTURE_SOURCE_PATTERN.test(filePath)
}

function featureName(filePath: string): string | null {
  const match = filePath.match(/^features\/([^/]+)\//)
  return match?.[1] ?? null
}

function isComponent(filePath: string): boolean {
  return filePath.split('/').includes('components') || filePath.startsWith('components/')
}

function isSharedComponent(filePath: string): boolean {
  return filePath.startsWith('components/')
}

function isSupabaseClientImport(specifier: string): boolean {
  return specifier === '@/lib/supabase'
    || specifier === '@/lib/supabase-server'
    || specifier === '@/lib/supabase-admin'
    || specifier === '@supabase/ssr'
    || specifier === '@supabase/supabase-js'
}

function isTypeOnlyImport(importClause: ts.ImportClause | undefined): boolean {
  if (!importClause) return false
  if (importClause.isTypeOnly) return true
  if (importClause.name || !importClause.namedBindings || !ts.isNamedImports(importClause.namedBindings)) return false
  return importClause.namedBindings.elements.every(element => element.isTypeOnly)
}

function isTypeOnlyExport(statement: ts.ExportDeclaration): boolean {
  if (statement.isTypeOnly) return true
  return statement.exportClause !== undefined
    && ts.isNamedExports(statement.exportClause)
    && statement.exportClause.elements.length > 0
    && statement.exportClause.elements.every(element => element.isTypeOnly)
}

function isCompatibilityShim(source: string, statement: ts.ExportDeclaration | null): boolean {
  return statement !== null && /backward compatibility/i.test(source)
}

function collectModuleReferences(parsed: ts.SourceFile): ModuleReference[] {
  const references: ModuleReference[] = []

  function add(node: ts.Node, specifier: string, typeOnly: boolean, exportDeclaration: ts.ExportDeclaration | null = null): void {
    references.push({
      specifier,
      typeOnly,
      exportDeclaration,
      line: parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line + 1,
    })
  }

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
      add(node, node.moduleSpecifier.text, isTypeOnlyImport(node.importClause))
      return
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      add(node, node.moduleSpecifier.text, isTypeOnlyExport(node), node)
      return
    }
    if (ts.isImportEqualsDeclaration(node)
      && ts.isExternalModuleReference(node.moduleReference)
      && node.moduleReference.expression
      && ts.isStringLiteralLike(node.moduleReference.expression)) {
      add(node, node.moduleReference.expression.text, node.isTypeOnly)
      return
    }
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteralLike(node.argument.literal)) {
      add(node, node.argument.literal.text, true)
      return
    }
    if (ts.isCallExpression(node)
      && node.arguments.length >= 1
      && ts.isStringLiteralLike(node.arguments[0])
      && (node.expression.kind === ts.SyntaxKind.ImportKeyword
        || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      add(node, node.arguments[0].text, false)
      return
    }
    ts.forEachChild(node, visit)
  }

  visit(parsed)
  return references
}

function internalTargetPath(filePath: string, specifier: string): string | null {
  if (specifier.startsWith('@/')) return specifier.slice(2)
  if (specifier.startsWith('.')) return posix.normalize(posix.join(posix.dirname(filePath), specifier))
  return null
}

function publicFeatureTarget(targetPath: string | null): { feature: string, surface: string | null } | null {
  const target = targetPath?.match(/^features\/([^/]+)(?:\/(.*))?$/)
  if (!target) return null
  const surface = target[2]?.replace(/\.(?:[cm]?js|jsx|[cm]?ts|tsx)$/, '') ?? null
  return { feature: target[1], surface }
}

function isPublicSurface(surface: string | null): boolean {
  return surface !== null && PUBLIC_ENTRYPOINTS.has(surface)
}

function addReferenceViolations(
  violations: ArchitectureViolation[],
  file: SourceFile,
  owner: string | null,
  reference: ModuleReference,
): void {
  const { specifier, line, typeOnly } = reference
  if (isComponent(file.path) && !typeOnly && isSupabaseClientImport(specifier)) {
    violations.push({
      rule: 'component-supabase-import',
      filePath: file.path,
      line,
      message: 'components must not import a Supabase client directly; move data access into feature server code or a hook',
      key: `component-supabase-import:${file.path}:${specifier}`,
    })
  }

  const targetPath = internalTargetPath(file.path, specifier)
  if (owner && (targetPath === 'app' || targetPath?.startsWith('app/'))) {
    violations.push({
      rule: 'feature-app-import',
      filePath: file.path,
      line,
      message: `feature "${owner}" must not import route composition from app/`,
      key: `feature-app-import:${file.path}:${specifier}`,
    })
  }

  const target = publicFeatureTarget(targetPath)
  const consumesAnotherFeature = owner !== null && target !== null && target.feature !== owner
  const sharedPrivateImport = isSharedComponent(file.path) && target !== null
  if ((!consumesAnotherFeature && !sharedPrivateImport)
    || target === null
    || isPublicSurface(target.surface)
    || isCompatibilityShim(file.source, reference.exportDeclaration)) return

  const consumer = owner ? `feature "${owner}"` : 'shared components'
  violations.push({
    rule: 'cross-feature-private-import',
    filePath: file.path,
    line,
    message: `${consumer} imports private code from feature "${target.feature}"; import its public API instead`,
    key: `cross-feature-private-import:${file.path}:${specifier}`,
  })
}

function directive(sourceFile: ts.SourceFile): 'use client' | 'use server' | null {
  const first = sourceFile.statements[0]
  if (!first || !ts.isExpressionStatement(first) || !ts.isStringLiteral(first.expression)) return null
  if (first.expression.text === 'use client' || first.expression.text === 'use server') return first.expression.text
  return null
}

function resolveModule(filePath: string, specifier: string, files: Map<string, ts.SourceFile>): ResolvedModule | null {
  const base = internalTargetPath(filePath, specifier)
  if (!base) return null

  const candidates = [base, ...RESOLUTION_EXTENSIONS.map(extension => `${base}${extension}`)]
  for (const extension of RESOLUTION_EXTENSIONS) candidates.push(`${base}/index${extension}`)
  for (const candidate of candidates) {
    const resolved = files.get(candidate)
    if (resolved) return { path: candidate, sourceFile: resolved }
  }
  return null
}

function categorizedSurface(filePath: string): 'client' | 'actions' | 'server' | null {
  const match = filePath.match(/^features\/[^/]+\/public(?:-(client|actions|server))?\.(?:[cm]?js|jsx|[cm]?ts|tsx)$/)
  return match ? (match[1] ?? 'client') as 'client' | 'actions' | 'server' : null
}

function isServerModulePath(filePath: string): boolean {
  return /(?:^|\/)(?:actions?|server)(?:\/|$|-)/.test(filePath)
    || /(?:^|\/)[^/]+(?:-server|\.server)(?:\.|\/|$)/.test(filePath)
    || publicFeatureTarget(filePath)?.surface === 'public-server'
}

function checkCategorizedSurface(
  file: SourceFile,
  references: ModuleReference[],
  parsedFiles: Map<string, ts.SourceFile>,
): ArchitectureViolation[] {
  const surface = categorizedSurface(file.path)
  if (!surface) return []

  if (surface === 'server') {
    const hasServerOnlyImport = references.some(reference => reference.specifier === 'server-only' && !reference.typeOnly)
    return hasServerOnlyImport ? [] : [{
      rule: 'public-server-boundary',
      filePath: file.path,
      line: 1,
      message: 'public-server must import "server-only" to prevent client consumption',
      key: `public-server-boundary:${file.path}`,
    }]
  }

  const violations: ArchitectureViolation[] = []
  for (const reference of references) {
    if (!reference.exportDeclaration || reference.typeOnly) continue
    const target = resolveModule(file.path, reference.specifier, parsedFiles)
    const targetDirective = target ? directive(target.sourceFile) : null

    if (surface === 'client') {
      const targetPath = target?.path ?? internalTargetPath(file.path, reference.specifier)
      const serverPath = targetPath !== null && isServerModulePath(targetPath)
      if (!serverPath && targetDirective !== 'use server') continue
      violations.push({
        rule: 'public-client-server-export',
        filePath: file.path,
        line: reference.line,
        message: 'public-client must not runtime-export server modules or actions',
        key: `public-client-server-export:${file.path}:${reference.specifier}`,
      })
    }

    if (surface === 'actions' && targetDirective !== 'use server') {
      violations.push({
        rule: 'public-actions-target',
        filePath: file.path,
        line: reference.line,
        message: 'runtime exports from public-actions must target a module with a "use server" directive',
        key: `public-actions-target:${file.path}:${reference.specifier}`,
      })
    }
  }
  return violations
}

function checkClientGraph(
  files: SourceFile[],
  referencesByPath: Map<string, ModuleReference[]>,
  parsedFiles: Map<string, ts.SourceFile>,
): ArchitectureViolation[] {
  const sourceByPath = new Map(files.map(file => [file.path, file]))
  const reachable = new Set<string>()
  const pending: string[] = []
  for (const [filePath, parsed] of parsedFiles) {
    if (directive(parsed) === 'use client' || categorizedSurface(filePath) === 'client') {
      reachable.add(filePath)
      pending.push(filePath)
    }
  }

  const violations: ArchitectureViolation[] = []
  while (pending.length > 0) {
    const filePath = pending.pop()
    if (!filePath) continue
    const file = sourceByPath.get(filePath)
    if (!file) continue

    for (const reference of referencesByPath.get(filePath) ?? []) {
      if (reference.typeOnly) continue
      if (reference.specifier === 'server-only') {
        violations.push({
          rule: 'client-server-public-import',
          filePath,
          line: reference.line,
          message: 'client-reachable modules must not import server-only code',
          key: `client-server-public-import:${filePath}:${reference.specifier}`,
        })
        continue
      }

      const target = resolveModule(filePath, reference.specifier, parsedFiles)
      if (!target) continue
      const targetDirective = directive(target.sourceFile)
      if (targetDirective === 'use server') continue

      if (isServerModulePath(target.path)) {
        const directSurfaceViolation = categorizedSurface(filePath) === 'client'
          && reference.exportDeclaration !== null
        if (!directSurfaceViolation) {
          violations.push({
            rule: 'client-server-public-import',
            filePath,
            line: reference.line,
            message: 'client-reachable modules must not import server-only code',
            key: `client-server-public-import:${filePath}:${reference.specifier}`,
          })
        }
        continue
      }

      if (!reachable.has(target.path)) {
        reachable.add(target.path)
        pending.push(target.path)
      }
    }
  }
  return violations
}

export function compareArchitectureBaseline(
  violations: ArchitectureViolation[],
  baselineKeys: readonly string[],
): ArchitectureBaselineResult {
  const currentKeys = new Set(violations.map(violation => violation.key))
  const baseline = new Set(baselineKeys)
  return {
    unexpected: violations.filter(violation => !baseline.has(violation.key)),
    resolved: [...baseline].filter(key => !currentKeys.has(key)).sort(),
  }
}

export function checkArchitecture(files: SourceFile[]): ArchitectureViolation[] {
  const violations: ArchitectureViolation[] = []
  const parsedFiles = new Map<string, ts.SourceFile>()
  const referencesByPath = new Map<string, ModuleReference[]>()
  for (const file of files) {
    const parsed = ts.createSourceFile(file.path, file.source, ts.ScriptTarget.Latest, true)
    parsedFiles.set(file.path, parsed)
    referencesByPath.set(file.path, collectModuleReferences(parsed))
  }

  for (const file of files) {
    if (APP_DOMAIN_DIRECTORY_PATTERN.test(file.path)) {
      violations.push({
        rule: 'app-domain-directory',
        filePath: file.path,
        line: 1,
        message: 'application domain code belongs in features/, not app/',
        key: `app-domain-directory:${file.path}`,
      })
    }

    const parsed = parsedFiles.get(file.path)
    if (!parsed) continue
    const references = referencesByPath.get(file.path) ?? []
    const owner = featureName(file.path)
    for (const reference of references) addReferenceViolations(violations, file, owner, reference)
    violations.push(...checkCategorizedSurface(file, references, parsedFiles))
  }

  violations.push(...checkClientGraph(files, referencesByPath, parsedFiles))

  return violations
}
