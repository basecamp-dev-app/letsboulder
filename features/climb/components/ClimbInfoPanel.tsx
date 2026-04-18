'use client'

import Link from 'next/link'
import { Flag, Share2, Star } from 'lucide-react'
import { formatGradeForDisplay } from '@/lib/grade-display'
import type { GradeOpinion } from '@/lib/grade-feedback'
import type { GradeSystem } from '@/lib/grades'
import LocationMapSnippet from '@/features/climb/components/LocationMapSnippet'

interface SubmitterInfo {
  id: string
  displayName: string
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
  totalRoutesCombined: number
  totalFaces: number
  isFacesLoading: boolean
  cragPath: string | null
  isOfflineSaved: boolean
  offlinePackAvailable: boolean
  publicSubmitter: SubmitterInfo | null
  formattedContributionHandle: string | null
  contributionCreditUrl: string | null
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
  userPresent: boolean
  gradeSystem: GradeSystem
  gradeOpinionLabels: Record<GradeOpinion, string>
  formatRouteTypeLabel: (value: string) => string
  onOpenOffline: () => void
  onOpenFlag: () => void
  onShare: () => void
  onGoToAuth: () => void
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
    totalRoutesCombined,
    totalFaces,
    isFacesLoading,
    cragPath,
    isOfflineSaved,
    offlinePackAvailable,
    publicSubmitter,
    formattedContributionHandle,
    contributionCreditUrl,
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
    userPresent,
    gradeSystem,
    gradeOpinionLabels,
    formatRouteTypeLabel,
    onOpenOffline,
    onOpenFlag,
    onShare,
    onGoToAuth,
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
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {selectedClimb ? selectedClimb.name : 'Select a route'}
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              {selectedClimb
                ? `Grade: ${formatGradeForDisplay(selectedClimb.grade, gradeSystem)}`
                : 'Tap a route on the image to select it'}
            </p>
            {selectedClimb?.route_type ? (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Type: {formatRouteTypeLabel(selectedClimb.route_type)}
              </p>
            ) : null}
            <p className="mt-1 text-xs text-blue-700 dark:text-blue-300">
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
            {publicSubmitter ? (
              <>
                {formattedContributionHandle ? (
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Credit to{' '}
                    {contributionCreditUrl ? (
                      <a href={contributionCreditUrl} target="_blank" rel="noopener noreferrer" className="underline decoration-gray-400 underline-offset-2 hover:text-gray-700 dark:hover:text-gray-200">
                        {formattedContributionHandle}
                      </a>
                    ) : (
                      <span>{formattedContributionHandle}</span>
                    )}
                  </p>
                ) : null}
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Submitted by{' '}
                  <Link href={`/logbook/${publicSubmitter.id}`} prefetch={false} className="underline decoration-gray-400 underline-offset-2 hover:text-gray-700 dark:hover:text-gray-200">
                    {publicSubmitter.displayName}
                  </Link>
                </p>
              </>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {cragPath ? (
              <a href={cragPath} className="px-3 py-1.5 text-sm text-gray-700 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800 rounded-lg transition-colors">
                View crag
              </a>
            ) : null}
            <button onClick={onOpenOffline} disabled={!offlinePackAvailable} className="px-3 py-1.5 text-sm text-gray-700 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              {isOfflineSaved ? 'Saved offline' : 'Save offline'}
            </button>
            <button onClick={onOpenFlag} disabled={!selectedClimb} className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed" aria-label="Report incorrect route info" title={selectedClimb ? 'Report incorrect route info' : 'Select a route to report'}>
              <Flag className="w-5 h-5" />
            </button>
            <button onClick={onShare} className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-800 rounded-lg transition-colors" aria-label="Share climb">
              <Share2 className="w-5 h-5" />
            </button>
            {selectedClimbLogged ? <span className="px-3 py-1 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200 rounded-full text-sm font-medium">Logged</span> : null}
          </div>
        </div>

        {!selectedClimbLogged ? (
          <div className="space-y-3">
            {!userPresent ? (
              <button onClick={onGoToAuth} className="w-full px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors">
                Sign in to Log This Climb
              </button>
            ) : (
              <>
                <p className="text-gray-400 text-sm">
                  {selectedRouteExists ? 'Route selected - choose an option below' : 'Tap a route to select it'}
                </p>

                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => onLog('flash')} disabled={logging || !selectedClimb} className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors">
                    Flash
                  </button>
                  <button onClick={() => onLog('top')} disabled={logging || !selectedClimb} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors">
                    Send
                  </button>
                  <button onClick={() => onLog('try')} disabled={logging || !selectedClimb} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors">
                    Try
                  </button>
                </div>
              </>
            )}
          </div>
        ) : null}

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
                  className="text-xs font-medium text-purple-700 transition hover:text-purple-900 dark:text-purple-300 dark:hover:text-purple-100"
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

        {selectedClimbLogged && selectedClimb ? (
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
