import { describe, expect, it } from 'vitest'
import { checkArchitecture, type SourceFile } from '@/scripts/check-architecture-rules'

function check(files: SourceFile[]) {
  return checkArchitecture(files).map(violation => violation.rule)
}

describe('checkArchitecture', () => {
  it('rejects runtime Supabase imports from components', () => {
    expect(check([{ path: 'features/crags/components/CragCard.tsx', source: "import { createClient } from '@/lib/supabase'" }]))
      .toEqual(['component-supabase-import'])
  })

  it('allows type-only Supabase imports from components', () => {
    expect(check([{ path: 'components/UserCard.tsx', source: "import type { User } from '@supabase/supabase-js'" }]))
      .toEqual([])
  })

  it('rejects domain directories under app while allowing route-local components', () => {
    expect(check([
      { path: 'app/settings/hooks/use-settings.ts', source: 'export {}' },
      { path: 'app/settings/components/SettingsContent.tsx', source: 'export {}' },
    ])).toEqual(['app-domain-directory'])
  })

  it('rejects private imports across features but allows public APIs and same-feature imports', () => {
    expect(check([
      { path: 'features/crags/components/CragCard.tsx', source: "import { useSavedCrag } from '@/features/saved/hooks/use-saved-crag'" },
      { path: 'features/crags/components/CragList.tsx', source: "import { SavedCragButton } from '@/features/saved/public'" },
      { path: 'features/crags/components/CragMap.tsx', source: "import { cragKeys } from '@/features/crags/lib/crag-queries'" },
    ])).toEqual(['cross-feature-private-import'])
  })

  it('allows documented compatibility shims', () => {
    expect(check([{
      path: 'features/editor/route-store-sync.ts',
      source: "// Re-exported for backward compatibility.\nexport { syncRoutes } from '@/features/submissions/lib/route-store-sync'",
    }])).toEqual([])
  })
})
