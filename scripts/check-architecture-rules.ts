import ts from 'typescript'

export interface SourceFile {
  path: string
  source: string
}

export type ArchitectureRule =
  | 'component-supabase-import'
  | 'app-domain-directory'
  | 'cross-feature-private-import'

export interface ArchitectureViolation {
  rule: ArchitectureRule
  filePath: string
  line: number
  message: string
  key: string
}

const APP_DOMAIN_DIRECTORY_PATTERN = /^app\/(?:.*\/)?(?:actions|hooks|lib|server|store|types)(?:\/|$)/

function featureName(filePath: string): string | null {
  const match = filePath.match(/^features\/([^/]+)\//)
  return match?.[1] ?? null
}

function isComponent(filePath: string): boolean {
  return filePath.split('/').includes('components') || filePath.startsWith('components/')
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

function isCompatibilityShim(source: string, statement: ts.ExportDeclaration): boolean {
  return /backward compatibility/i.test(source) && statement.moduleSpecifier !== undefined
}

function addImportViolation(
  violations: ArchitectureViolation[],
  file: SourceFile,
  owner: string | null,
  specifier: string,
  line: number,
  isTypeOnly: boolean,
  isShim: boolean,
): void {
  if (isComponent(file.path) && !isTypeOnly && isSupabaseClientImport(specifier)) {
    violations.push({
      rule: 'component-supabase-import',
      filePath: file.path,
      line,
      message: 'components must not import a Supabase client directly; move data access into feature server code or a hook',
      key: `component-supabase-import:${file.path}:${specifier}`,
    })
  }

  const target = specifier.match(/^@\/features\/([^/]+)(?:\/(.*))?$/)
  if (!owner || !target || target[1] === owner || target[2] === 'public' || isShim) return

  violations.push({
    rule: 'cross-feature-private-import',
    filePath: file.path,
    line,
    message: `feature "${owner}" imports private code from feature "${target[1]}"; import its public API instead`,
    key: `cross-feature-private-import:${file.path}:${specifier}`,
  })
}

export function checkArchitecture(files: SourceFile[]): ArchitectureViolation[] {
  const violations: ArchitectureViolation[] = []

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

    const parsed = ts.createSourceFile(file.path, file.source, ts.ScriptTarget.Latest, true)
    const owner = featureName(file.path)

    for (const statement of parsed.statements) {
      if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue
      if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue

      const line = parsed.getLineAndCharacterOfPosition(statement.getStart(parsed)).line + 1
      const isImport = ts.isImportDeclaration(statement)
      addImportViolation(
        violations,
        file,
        owner,
        statement.moduleSpecifier.text,
        line,
        isImport && isTypeOnlyImport(statement.importClause),
        !isImport && isCompatibilityShim(file.source, statement),
      )
    }
  }

  return violations
}
