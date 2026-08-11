import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  checkArchitecture,
  compareArchitectureBaseline,
  isArchitectureSourcePath,
  type ArchitectureRule,
  type SourceFile,
} from '@/scripts/check-architecture-rules'

const FIXTURES = join(process.cwd(), 'tests/fixtures/architecture')

function fixtureFiles(name: string): SourceFile[] {
  const root = join(FIXTURES, name)
  const paths: string[] = []
  const stack = [root]
  while (stack.length > 0) {
    const directory = stack.pop()
    if (!directory) continue
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) stack.push(path)
      if (entry.isFile() && isArchitectureSourcePath(path)) paths.push(path)
    }
  }
  return paths.map(path => ({
    path: relative(root, path).replaceAll('\\', '/'),
    source: readFileSync(path, 'utf8'),
  }))
}

function rules(files: SourceFile[]): ArchitectureRule[] {
  return checkArchitecture(files).map(violation => violation.rule)
}

describe('checkArchitecture', () => {
  it('rejects runtime Supabase imports from components but allows erased imports', () => {
    expect(rules([
      { path: 'features/crags/components/CragCard.tsx', source: "import { createClient } from '@/lib/supabase'" },
      { path: 'components/UserCard.tsx', source: "import type { User } from '@supabase/supabase-js'" },
    ])).toEqual(['component-supabase-import'])
  })

  it('rejects domain directories under app while allowing route-local components', () => {
    expect(rules([
      { path: 'app/settings/hooks/use-settings.ts', source: 'export {}' },
      { path: 'app/settings/components/SettingsContent.tsx', source: 'export {}' },
    ])).toEqual(['app-domain-directory'])
  })

  it('detects static imports and exports, dynamic imports, require, JS, and semantic type-only references', () => {
    const files = fixtureFiles('module-syntax').map(file => ({ path: `features/alpha/${file.path}`, source: file.source }))
    expect(rules(files)).toEqual([
      'cross-feature-private-import',
      'cross-feature-private-import',
      'cross-feature-private-import',
      'cross-feature-private-import',
      'cross-feature-private-import',
      'cross-feature-private-import',
    ])
    expect(files.map(file => file.path).sort()).toEqual([
      'features/alpha/consumer.js',
      'features/alpha/consumer.ts',
      'features/alpha/recognized.cjs',
      'features/alpha/recognized.jsx',
      'features/alpha/recognized.mjs',
    ])
  })

  it('supports all curated public feature entrypoints and blocks features importing app', () => {
    expect(rules([
      { path: 'features/alpha/view.ts', source: [
        "import type { A } from '@/features/beta/public'",
        "export { B } from '@/features/beta/public-client'",
        "import { C } from '@/features/beta/public-actions'",
        "import { D } from '@/features/beta/public-server'",
        "import type { Page } from '@/app/page'",
      ].join('\n') },
    ])).toEqual(['feature-app-import'])
  })

  it('enforces feature and app boundaries for relative imports', () => {
    expect(rules([
      { path: 'features/alpha/view.ts', source: "import '../beta/private'\nimport '../../app/page'" },
      { path: 'components/SharedWidget.tsx', source: "import '../features/beta/private'" },
    ])).toEqual([
      'cross-feature-private-import',
      'feature-app-import',
      'cross-feature-private-import',
    ])
  })

  it('requires shared components, but not app composition, to use public entrypoints', () => {
    const files = fixtureFiles('shared')
    expect(rules(files)).toEqual(['cross-feature-private-import'])
  })

  it('checks categorized client, actions, and server surfaces without flagging erased exports', () => {
    expect(rules(fixtureFiles('surfaces')).sort()).toEqual([
      'client-server-public-import',
      'public-actions-target',
      'public-client-server-export',
      'public-server-boundary',
    ])
  })

  it('checks generic public surfaces and transitive client-to-server imports', () => {
    const violations = checkArchitecture([
      { path: 'features/direct/public.ts', source: "export { load } from './server/load'" },
      { path: 'features/direct/server/load.ts', source: 'export const load = true' },
      { path: 'features/transitive/public.ts', source: "export { bridge } from './lib/bridge'" },
      { path: 'features/transitive/lib/bridge.ts', source: "export { load as bridge } from '../server/load'" },
      { path: 'features/transitive/server/load.ts', source: 'export const load = true' },
    ])

    expect(violations.map(violation => violation.rule).sort()).toEqual([
      'client-server-public-import',
      'public-client-server-export',
    ])
    expect(violations.find(violation => violation.rule === 'client-server-public-import')).toMatchObject({
      filePath: 'features/transitive/lib/bridge.ts',
      line: 1,
    })
  })

  it('propagates client reachability but stops at erased imports and Server Actions', () => {
    expect(rules([
      { path: 'features/alpha/components/Client.tsx', source: "'use client'\nimport { helper } from '../lib/helper'\nimport { save } from '../actions/save'\nimport type { Record } from '../server/types'\nvoid helper\nvoid save" },
      { path: 'features/alpha/lib/helper.ts', source: "import { load } from '../server/load'\nexport const helper = load" },
      { path: 'features/alpha/actions/save.ts', source: "'use server'\nimport { load } from '../server/load'\nexport async function save() { return load }" },
      { path: 'features/alpha/server/load.ts', source: 'export const load = true' },
      { path: 'features/alpha/server/types.ts', source: 'export interface Record {}' },
    ])).toEqual(['client-server-public-import'])
  })

  it('allows curated feature public surfaces', () => {
    expect(rules([{
      path: 'features/alpha/components/Client.tsx',
      source: "'use client'\nimport { syncRoutes } from '@/features/submissions/public-client'\nvoid syncRoutes",
    }])).toEqual([])
  })
})

describe('compareArchitectureBaseline', () => {
  const violation = checkArchitecture([{
    path: 'features/alpha/view.ts',
    source: "import { privateValue } from '@/features/beta/private'",
  }])[0]

  it('rejects baseline additions', () => {
    expect(compareArchitectureBaseline([violation], [])).toEqual({ unexpected: [violation], resolved: [] })
  })

  it('accepts an exact baseline and requires removals when a violation is fixed', () => {
    expect(compareArchitectureBaseline([violation], [violation.key])).toEqual({ unexpected: [], resolved: [] })
    expect(compareArchitectureBaseline([], [violation.key])).toEqual({ unexpected: [], resolved: [violation.key] })
  })

  it('rejects a reintroduced violation after its baseline entry is removed', () => {
    expect(compareArchitectureBaseline([violation], []).unexpected).toEqual([violation])
  })
})
