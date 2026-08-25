'use client'

import { useMemo, useState } from 'react'
import { CheckCircle2, EyeOff, Link2, Loader2 } from 'lucide-react'

import { setTopoReplacementRouteAction } from '@/features/crag-management/actions/topo-replacement'
import type { DraftRoute, TopoReplacementDraft } from '@/features/draft-editor/public'
import { Button } from '@/components/ui/button'

interface DrawnRoute extends DraftRoute {
  imageId: string
}

interface TopoReplacementMappingPanelProps {
  replacement: TopoReplacementDraft
  routesByImageId: Record<string, DraftRoute[]>
  hasPendingChanges: boolean
}

export default function TopoReplacementMappingPanel({
  replacement,
  routesByImageId,
  hasPendingChanges,
}: TopoReplacementMappingPanelProps) {
  const [targets, setTargets] = useState(replacement.routes)
  const [pendingClimbId, setPendingClimbId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const drawnRoutes = useMemo<DrawnRoute[]>(() => Object.entries(routesByImageId)
    .flatMap(([imageId, routes]) => routes.map((route) => ({ ...route, imageId }))), [routesByImageId])
  const mappedDraftRouteIds = new Set(targets
    .map((target) => target.draftRouteId)
    .filter((id): id is string => typeof id === 'string'))
  const unresolvedCount = targets.filter((target) => target.resolution === 'pending').length

  async function updateTarget(climbId: string, value: string) {
    const resolution = value === 'not_visible' ? 'not_visible' : value ? 'mapped' : 'pending'
    setPendingClimbId(climbId)
    setError(null)
    const result = await setTopoReplacementRouteAction({
      replacementId: replacement.id,
      climbId,
      resolution,
      draftRouteId: resolution === 'mapped' ? value : null,
    })
    setPendingClimbId(null)
    if (!result.success) {
      setError(result.error || 'Failed to save route mapping')
      return
    }
    setTargets((current) => current.map((target) => target.climbId === climbId
      ? { ...target, resolution, draftRouteId: resolution === 'mapped' ? value : null }
      : target))
  }

  return (
    <section className="mb-4 rounded-2xl border border-blue-500/30 bg-blue-500/5 p-4" aria-labelledby="topo-relink-heading">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold" id="topo-relink-heading">
            <Link2 className="h-5 w-5 text-blue-400" aria-hidden="true" /> Relink existing routes
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Draw lines on the replacement photo, save the draft, then map each line to its existing route. Names, grades, URLs, sends, and logs remain attached to the original route IDs.
          </p>
        </div>
        <span className="rounded-full border px-3 py-1 text-xs font-medium">
          {unresolvedCount === 0 ? 'Ready to publish' : `${unresolvedCount} unresolved`}
        </span>
      </div>

      {hasPendingChanges ? (
        <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          Save the draft before changing route mappings.
        </p>
      ) : null}
      {error ? <p className="mt-3 text-sm text-red-300" role="alert">{error}</p> : null}

      <div className="mt-4 space-y-3">
        {targets.map((target) => (
          <div className="grid gap-3 rounded-xl border bg-background/70 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(15rem,1fr)] sm:items-center" key={target.climbId}>
            <div>
              <p className="font-medium">{target.name}</p>
              <p className="text-xs text-muted-foreground">{target.grade} · route ID {target.climbId.slice(0, 8)}</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                aria-label={`Replacement line for ${target.name}`}
                className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-sm"
                disabled={hasPendingChanges || pendingClimbId === target.climbId}
                onChange={(event) => { void updateTarget(target.climbId, event.target.value) }}
                value={target.resolution === 'not_visible' ? 'not_visible' : target.draftRouteId || ''}
              >
                <option value="">Needs a replacement line</option>
                {drawnRoutes.map((route, index) => {
                  const usedElsewhere = mappedDraftRouteIds.has(route.id) && route.id !== target.draftRouteId
                  return <option disabled={usedElsewhere} key={route.id} value={route.id}>Line {index + 1}: {route.name || 'Unnamed'}</option>
                })}
                <option value="not_visible">Not visible in replacement</option>
              </select>
              {pendingClimbId === target.climbId ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : target.resolution === 'mapped' ? <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden="true" /> : target.resolution === 'not_visible' ? <EyeOff className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> : null}
            </div>
          </div>
        ))}
      </div>

      {targets.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">This topo has no existing routes to relink. Publish it without drawing any lines.</p>
      ) : null}
      <div className="mt-4 flex justify-end">
        <Button disabled type="button" variant="outline">{unresolvedCount === 0 ? 'Mappings complete' : 'Resolve all routes before publishing'}</Button>
      </div>
    </section>
  )
}
