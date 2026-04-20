'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { SavedClimb, SavedCrag } from '@/features/saved/lib/types'

interface LogbookSavedSectionProps {
  savedClimbs: SavedClimb[]
  savedCrags: SavedCrag[]
}

export function LogbookSavedSection({ savedClimbs, savedCrags }: LogbookSavedSectionProps) {
  return (
    <Card className="m-0 border-x-0 border-t-0 rounded-none">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Saved</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 pt-0">
        <section>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Want to try</h3>
            <span className="text-xs text-gray-500 dark:text-gray-400">{savedClimbs.length}</span>
          </div>
          {savedClimbs.length === 0 ? <p className="text-sm text-gray-500 dark:text-gray-400">No saved climbs yet.</p> : (
            <div className="space-y-2">
              {savedClimbs.map((climb) => (
                <a key={`${climb.climbId}-${climb.createdAt}`} href={climb.canonicalUrl || `/climb/${climb.climbId}`} className="block rounded-2xl border border-gray-200 bg-white px-4 py-3 transition hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{climb.name}</p>
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{climb.grade || 'Unknown grade'} · {climb.cragName}</p>
                    </div>
                    <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">{new Date(climb.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                  </div>
                </a>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Saved crags</h3>
            <span className="text-xs text-gray-500 dark:text-gray-400">{savedCrags.length}</span>
          </div>
          {savedCrags.length === 0 ? <p className="text-sm text-gray-500 dark:text-gray-400">No saved crags yet.</p> : (
            <div className="space-y-2">
              {savedCrags.map((crag) => (
                <a key={`${crag.cragId}-${crag.createdAt}`} href={crag.canonicalUrl || `/crag/${crag.cragId}`} className="block rounded-2xl border border-gray-200 bg-white px-4 py-3 transition hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{crag.name}</p>
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{[crag.regionName, crag.countryName].filter(Boolean).join(', ') || 'Crag'}</p>
                    </div>
                    <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">{new Date(crag.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                  </div>
                </a>
              ))}
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  )
}
