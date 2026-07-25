'use client'

import Link from 'next/link'
import { Flag, Share2, Star } from 'lucide-react'
import { formatGradeForDisplay } from '@/lib/grade-display'
import type { GradeOpinion } from '@/lib/grade-feedback'
import type { GradeSystem } from '@/lib/grades'
import LocationMapSnippet from '@/features/climb/components/LocationMapSnippet'

interface AttributionInfo {
  ownerRoleLabel: string
  ownerDisplayLabel: string
  ownerProfileId: string | null
  formattedContributionHandle: string | null
  contributionCreditUrl: string | null
  communityEditorsRoleLabel: string
  communityEditorsCount: number
}

interface RatingSummary {
  rating_avg: number | null
  rating_count: number
}

interface LoggedClimbInfo {
  gradeOpinion: GradeOpinion | null
  starRating: number | null
  notes: string | null
}

interface CommunityNoteInfo {
  userId: string
  displayName: string
  notes: string
  createdAt: string | null
}

interface SelectedClimbInfo {
  id: string
  name: string
  grade: string
  route_type: string | null
  description: string | null
}

interface ClimbInfoPanelProps {
  selectedClimb: SelectedClimbInfo | null
  selectedRouteExists: boolean
  canEditRoute: boolean
  canAddRoutes: boolean
  totalRoutesCombined: number
  totalFaces: number
  isFacesLoading: boolean
  cragPath: string | null
  isOfflineSaved: boolean
  offlinePackAvailable: boolean
  attribution: AttributionInfo
  imageLatitude: number | null
  imageLongitude: number | null
  selectedClimbLogged: boolean
  selectedClimbLog: LoggedClimbInfo | null
  selectedClimbHasSavedFeedback: boolean
  selectedClimbFeedbackCollapsed: boolean
  selectedClimbRatingSummary: RatingSummary | null
  selectedClimbAverageRating: number | null
  selectedClimbRoundedStars: number
  pendingGradeOpinion: GradeOpinion | null
  pendingStarRating: number | null
  communityNotesCount: number
  communityNotes: CommunityNoteInfo[]
  communityNotesExpanded: boolean
  savingFeedback: boolean
  logging: boolean
  savingWantToTry: boolean
  loadingSelectedClimbState: boolean
  userPresent: boolean
  isWantToTrySaved: boolean
  gradeSystem: GradeSystem
  gradeOpinionLabels: Record<GradeOpinion, string>
  formatRouteTypeLabel: (value: string) => string
  onOpenOffline: () => void
  onEditRoute: () => void
  onAddRoutes: () => void
  onOpenFlag: () => void
  onShare: () => void
  onGoToAuth: () => void
  onToggleWantToTry: () => void
  onLog: (style: 'flash' | 'top' | 'try') => void
  onSetFeedbackCollapsed: (collapsed: boolean) => void
  onSetPendingGradeOpinion: (value: GradeOpinion) => void
  onSetPendingStarRating: (value: number | null) => void
  onToggleCommunityNotesExpanded: () => void
  onSaveFeedback: () => void
  onGoToLogbook: () => void
  deferredSections: React.ReactNode
}

export default function ClimbInfoPanel(props: ClimbInfoPanelProps) {
  const {
    selectedClimb,
    selectedRouteExists,
    canEditRoute,
    canAddRoutes,
    totalRoutesCombined,
    totalFaces,
    isFacesLoading,
    cragPath,
    isOfflineSaved,
    offlinePackAvailable,
    attribution,
    imageLatitude,
    imageLongitude,
    selectedClimbLogged,
    selectedClimbLog,
    selectedClimbFeedbackCollapsed,
    selectedClimbRatingSummary,
    selectedClimbAverageRating,
    selectedClimbRoundedStars,
    pendingGradeOpinion,
    pendingStarRating,
    communityNotesCount,
    communityNotes,
    communityNotesExpanded,
    savingFeedback,
    logging,
    savingWantToTry,
    loadingSelectedClimbState,
    userPresent,
    isWantToTrySaved,
    gradeSystem,
    gradeOpinionLabels,
    formatRouteTypeLabel,
    onOpenOffline,
    onEditRoute,
    onAddRoutes,
    onOpenFlag,
    onShare,
    onGoToAuth,
    onToggleWantToTry,
    onLog,
    onSetFeedbackCollapsed,
    onSetPendingGradeOpinion,
    onSetPendingStarRating,
    onToggleCommunityNotesExpanded,
    onGoToLogbook,
    deferredSections,
  } = props
  const visibleCommunityNotes = communityNotesExpanded ? communityNotes : communityNotes.slice(0, 3)
  const hasMoreCommunityNotes = communityNotes.length > 3

  return (
    <div className="relative z-20 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 p-4">
      <div className="max-w-md mx-auto">
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {selectedClimb ? selectedClimb.name : canAddRoutes ? 'This photo needs routes' : 'Select a route'}
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              {selectedClimb
                ? `Grade: ${formatGradeForDisplay(selectedClimb.grade, gradeSystem)}`
                : canAddRoutes
                  ? 'Know this wall? Trace the first line and add route details.'
                  : 'Tap a route on the image to select it'}
            </p>
            {selectedClimb?.route_type ? (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Type: {formatRouteTypeLabel(selectedClimb.route_type)}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {cragPath ? (
              <a href={cragPath} className="inline-flex min-h-11 items-center justify-center px-3 py-1.5 text-sm text-gray-700 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800 rounded-lg transition-colors">
                View crag
              </a>
            ) : null}
            {offlinePackAvailable ? (
              <button onClick={onOpenOffline} className="inline-flex min-h-11 items-center justify-center px-3 py-1.5 text-sm text-gray-700 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800 rounded-lg transition-colors">
                {isOfflineSaved ? 'Saved offline' : 'Save offline'}
              </button>
            ) : null}
            <button
              onClick={userPresent ? onToggleWantToTry : onGoToAuth}
              disabled={!selectedClimb || savingWantToTry || loadingSelectedClimbState}
              className={`inline-flex min-h-11 items-center justify-center px-3 py-1.5 text-sm font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${isWantToTrySaved ? 'bg-amber-100 text-amber-900 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:hover:bg-amber-900/50' : 'text-amber-800 hover:text-amber-900 hover:bg-amber-50 dark:text-amber-300 dark:hover:text-amber-100 dark:hover:bg-amber-950/40'}`}
            >
              {loadingSelectedClimbState ? 'Loading...' : savingWantToTry ? 'Saving...' : isWantToTrySaved ? 'Saved' : 'Want to try'}
            </button>
            {canEditRoute ? (
              <button onClick={onEditRoute} className="inline-flex min-h-11 items-center justify-center px-3 py-1.5 text-sm font-medium text-blue-700 hover:text-blue-900 hover:bg-blue-50 dark:text-blue-300 dark:hover:text-blue-100 dark:hover:bg-blue-950/40 rounded-lg transition-colors">
                Edit this route
              </button>
            ) : null}
            {!canEditRoute && canAddRoutes ? (
              <button onClick={onAddRoutes} className="inline-flex min-h-11 items-center justify-center px-3 py-1.5 text-sm font-medium text-blue-700 hover:text-blue-900 hover:bg-blue-50 dark:text-blue-300 dark:hover:text-blue-100 dark:hover:bg-blue-950/40 rounded-lg transition-colors">
                Add the first route
              </button>
            ) : null}
            <button onClick={onOpenFlag} disabled={!selectedClimb} className="inline-flex size-11 items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed" aria-label="Report incorrect route info" title={selectedClimb ? 'Report incorrect route info' : 'Select a route to report'}>
              <Flag className="w-5 h-5" />
            </button>
            <button onClick={onShare} className="inline-flex size-11 items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-800 rounded-lg transition-colors" aria-label="Share climb">
              <Share2 className="w-5 h-5" />
            </button>
            {!loadingSelectedClimbState && selectedClimbLogged ? <span className="px-3 py-1 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200 rounded-full text-sm font-medium">Logged</span> : null}
          </div>
        </div>

        {loadingSelectedClimbState && selectedClimb ? (
          <p role="status" className="mt-4 text-sm text-gray-500 dark:text-gray-400">Loading climb state...</p>
        ) : !selectedClimbLogged ? (
          <div className="sticky bottom-[calc(var(--app-mobile-footer-offset)+env(safe-area-inset-bottom))] z-30 -mx-4 mt-4 space-y-3 border-t border-gray-200 bg-white/95 p-4 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95 md:static md:mx-0 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
            {!userPresent && selectedRouteExists ? (
              <button onClick={onGoToAuth} className="min-h-12 w-full rounded-xl bg-gray-700 px-4 py-3 font-medium text-white transition-colors hover:bg-gray-600">
                Sign in to Log This Climb
              </button>
            ) : (
              <>
                <p className="text-gray-400 text-sm">
                  {selectedRouteExists
                    ? 'Route selected - choose an option below'
                    : canAddRoutes
                      ? 'No routes have been added to this image yet.'
                      : 'Tap a route to select it'}
                </p>

                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => onLog('flash')} disabled={logging || !selectedClimb} className="min-h-12 rounded-xl bg-yellow-600 px-4 py-2 font-medium text-white transition-colors hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-50">
                    Flash
                  </button>
                  <button onClick={() => onLog('top')} disabled={logging || !selectedClimb} className="min-h-12 rounded-xl bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50">
                    Send
                  </button>
                  <button onClick={() => onLog('try')} disabled={logging || !selectedClimb} className="min-h-12 rounded-xl bg-gray-700 px-4 py-2 font-medium text-white transition-colors hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50">
                    Try
                  </button>
                </div>
              </>
            )}
          </div>
        ) : null}

        <div className="mt-4">
          <p className="text-xs text-blue-700 dark:text-blue-300">
            {isFacesLoading ? 'Loading routes...' : `${totalRoutesCombined} route${totalRoutesCombined === 1 ? '' : 's'}`}
            {totalFaces > 1 ? ` across ${totalFaces} faces` : ''}
          </p>
          {selectedClimb ? (
            <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {selectedClimbRatingSummary
                ? selectedClimbRatingSummary.rating_count > 0
                  ? (
                      <div className="flex items-center gap-2">
                        <span>{selectedClimbAverageRating?.toFixed(1) || '0.0'}</span>
                        <div className="flex items-center gap-0.5" aria-label="Community star rating">
                          {[1, 2, 3, 4, 5].map((value) => {
                            const active = value <= selectedClimbRoundedStars
                            return <Star key={value} className={`w-4 h-4 ${active ? 'fill-amber-400 text-amber-500' : 'text-gray-300 dark:text-gray-600'}`} />
                          })}
                        </div>
                        <span>({selectedClimbRatingSummary.rating_count})</span>
                      </div>
                    )
                  : 'Community rating: No ratings yet'
                : 'Community rating: Loading...'}
            </div>
          ) : null}
          {selectedClimb?.description ? <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{selectedClimb.description}</p> : null}
          {communityNotesCount > 0 ? (
            <p className="mt-1 text-xs text-purple-700 dark:text-purple-300">
              {communityNotesCount} user{communityNotesCount === 1 ? '' : 's'} shared route beta
            </p>
          ) : null}
          <div className="mt-3 rounded-2xl border border-blue-200/70 bg-blue-50/70 p-3 dark:border-blue-900/50 dark:bg-blue-950/20">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
              {attribution.ownerRoleLabel}
            </p>
            <p className="mt-1 whitespace-nowrap text-sm text-gray-700 dark:text-gray-200">
              Uploaded by{' '}
              {attribution.ownerProfileId ? (
                <Link href={`/logbook/${attribution.ownerProfileId}`} prefetch={false} className="font-medium underline decoration-gray-400 underline-offset-2 hover:text-gray-900 dark:hover:text-white">
                  {attribution.ownerDisplayLabel}
                </Link>
              ) : (
                <span className="font-medium">{attribution.ownerDisplayLabel}</span>
              )}
            </p>
            {attribution.formattedContributionHandle ? (
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                Contribution credit:{' '}
                {attribution.contributionCreditUrl ? (
                  <a href={attribution.contributionCreditUrl} target="_blank" rel="noopener noreferrer" className="underline decoration-gray-400 underline-offset-2 hover:text-gray-900 dark:hover:text-white">
                    {attribution.formattedContributionHandle}
                  </a>
                ) : (
                  <span>{attribution.formattedContributionHandle}</span>
                )}
              </p>
            ) : null}
            {attribution.communityEditorsCount > 0 ? (
              <div className="mt-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
                  {attribution.communityEditorsRoleLabel}
                </p>
                <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">
                  Refined by {attribution.communityEditorsCount} contributor{attribution.communityEditorsCount === 1 ? '' : 's'}
                </p>
              </div>
            ) : null}
          </div>
        </div>

        {communityNotes.length > 0 ? (
          <div className="mt-4 rounded-2xl border border-purple-200/70 bg-purple-50/70 p-3 dark:border-purple-900/50 dark:bg-purple-950/20">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-purple-700 dark:text-purple-300">
                  Route beta
                </p>
                <p className="mt-1 text-xs text-purple-700/80 dark:text-purple-200/80">
                  {communityNotesCount} note{communityNotesCount === 1 ? '' : 's'} from climbers on this line
                </p>
              </div>
              {hasMoreCommunityNotes ? (
                <button
                  type="button"
                  onClick={onToggleCommunityNotesExpanded}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg px-3 text-xs font-medium text-purple-700 transition hover:text-purple-900 dark:text-purple-300 dark:hover:text-purple-100"
                >
                  {communityNotesExpanded ? 'Show fewer' : `See all ${communityNotes.length}`}
                </button>
              ) : null}
            </div>

            <div className="mt-3 space-y-2">
              {visibleCommunityNotes.map((note) => (
                <div key={note.userId} className="rounded-2xl border border-purple-200/70 bg-white/80 px-3 py-2 text-xs shadow-sm dark:border-purple-900/40 dark:bg-zinc-900/70">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-gray-900 dark:text-gray-100">{note.displayName}</p>
                    {note.createdAt ? (
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">{new Date(note.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
                    ) : null}
                  </div>
                  <p className="mt-1 leading-5 text-gray-700 dark:text-gray-300">{note.notes}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {!loadingSelectedClimbState && selectedClimbLogged && selectedClimb ? (
          <div className="space-y-3">
            {selectedClimbFeedbackCollapsed ? (
              <div className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-green-700 dark:text-green-400">Saved</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Grade feel: {selectedClimbLog?.gradeOpinion ? gradeOpinionLabels[selectedClimbLog.gradeOpinion] : 'Not set'}
                    </p>
                  </div>
                  <button type="button" onClick={() => onSetFeedbackCollapsed(false)} className="text-xs font-medium px-2 py-1 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                    Edit
                  </button>
                </div>

                <div className="flex items-center gap-1 mt-3">
                  {[1, 2, 3, 4, 5].map((value) => {
                    const active = (selectedClimbLog?.starRating ?? 0) >= value
                    return <Star key={value} className={`w-4 h-4 ${active ? 'fill-amber-400 text-amber-500' : 'text-gray-300 dark:text-gray-600'}`} />
                  })}
                  {!selectedClimbLog?.starRating ? <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">No star rating yet</span> : null}
                </div>
                {selectedClimbLog?.notes ? (
                  <p className="mt-2 text-xs text-gray-600 dark:text-gray-400 italic">
                    &ldquo;{selectedClimbLog.notes}&rdquo;
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">How did the grade feel?</p>
                <div className="grid grid-cols-3 gap-2 mt-3">
                  {([
                    { value: 'soft', label: 'Soft' },
                    { value: 'agree', label: 'Agree' },
                    { value: 'hard', label: 'Hard' },
                  ] as Array<{ value: GradeOpinion; label: string }>).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => onSetPendingGradeOpinion(option.value)}
                      disabled={savingFeedback}
                      className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${pendingGradeOpinion === option.value ? 'border-gray-900 dark:border-gray-100 bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-4">Rate the climb</p>
                <div className="flex items-center gap-1 mt-2">
                  {[1, 2, 3, 4, 5].map((value) => {
                    const active = (pendingStarRating ?? 0) >= value
                    return (
                      <button key={value} type="button" onClick={() => onSetPendingStarRating(value)} disabled={savingFeedback} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50" aria-label={`Rate ${value} star${value > 1 ? 's' : ''}`}>
                        <Star className={`w-5 h-5 ${active ? 'fill-amber-400 text-amber-500' : 'text-gray-300 dark:text-gray-600'}`} />
                      </button>
                    )
                  })}
                  {pendingStarRating ? (
                    <button type="button" onClick={() => onSetPendingStarRating(null)} disabled={savingFeedback} className="ml-2 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-50">
                      Clear
                    </button>
                  ) : null}
                </div>
              </div>
            )}

            <button onClick={onGoToLogbook} className="w-full px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors">
              View Logbook
            </button>
          </div>
        ) : null}
        {typeof imageLatitude === 'number' && typeof imageLongitude === 'number' ? (
          <LocationMapSnippet latitude={imageLatitude} longitude={imageLongitude} className="mt-4" />
        ) : null}
        {deferredSections}
      </div>
    </div>
  )
}
