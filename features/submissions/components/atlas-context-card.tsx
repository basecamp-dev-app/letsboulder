'use client'

import { ChevronRight, Loader2 } from 'lucide-react'
import type { AtlasAutoSyncResult } from '@/features/editor/location/use-atlas-auto-sync'

interface AtlasContextCardProps {
  result: AtlasAutoSyncResult
}

export default function AtlasContextCard({ result }: AtlasContextCardProps) {
  if (result.loading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Resolving administrative location...</span>
        </div>
      </div>
    )
  }

  if (!result.atlas) return null

  const { continentName, unRegionName, adminRegionName, countryName } = result.atlas

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <h4 className="text-[10px] font-bold uppercase tracking-tight text-slate-500">
          Detected Administrative Location
        </h4>
        <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-slate-700">
          {continentName ? <span>{continentName}</span> : null}
          {continentName && unRegionName ? <ChevronRight className="h-3 w-3 text-slate-300" /> : null}
          {unRegionName ? <span>{unRegionName}</span> : null}
          {(continentName || unRegionName) && adminRegionName ? <ChevronRight className="h-3 w-3 text-slate-300" /> : null}
          {adminRegionName ? <span>{adminRegionName}</span> : null}
          {(continentName || unRegionName || adminRegionName) && countryName ? <ChevronRight className="h-3 w-3 text-slate-300" /> : null}
          {countryName ? <span className="font-semibold text-slate-900">{countryName}</span> : null}
        </div>
      </div>

      {result.nearbyCrag ? (
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
          <h4 className="text-[10px] font-bold uppercase tracking-tight text-blue-500">
            Climbing Destination
          </h4>
          <p className="mt-0.5 text-sm font-medium text-blue-900">
            {result.nearbyCrag.name}
            <span className="ml-2 text-xs font-normal text-blue-600">
              ({Math.round(result.nearbyCrag.distanceMeters || 0)}m away)
            </span>
          </p>
        </div>
      ) : null}

      {result.error ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
          {result.error}
        </div>
      ) : null}
    </div>
  )
}
