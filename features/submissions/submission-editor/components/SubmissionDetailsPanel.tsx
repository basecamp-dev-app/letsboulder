'use client'

import { Users } from 'lucide-react'
import { CollapsiblePanel } from '@/features/submissions/components/editor/CollapsiblePanel'
import { CreditSection } from '@/features/submissions/components/editor/CreditSection'
import { OrientationPicker } from '@/features/submissions/components/editor/OrientationPicker'
import type { CommunityMember, SubmissionHistoryEntry } from '@/features/submissions/lib/editor-types'
import type { SubmissionCreditPlatform } from '@/features/submissions/lib/submission-credit'
import type { FaceDirection } from '@/features/submissions/lib/submission-types'

interface SubmissionDetailsPanelProps {
  detailsOpen: boolean
  onDetailsToggle: () => void
  orientationOpen: boolean
  onOrientationToggle: () => void
  faceDirections: FaceDirection[]
  onToggleFaceDirection: (direction: FaceDirection) => void
  owner: CommunityMember | null
  contributors: CommunityMember[]
  history: SubmissionHistoryEntry[]
  canEditCredit: boolean
  isAnonymous: boolean
  onAnonymousChange: (value: boolean) => void
  creditPlatform: SubmissionCreditPlatform
  onCreditPlatformChange: (value: SubmissionCreditPlatform) => void
  creditHandle: string
  onCreditHandleChange: (value: string) => void
}

export function SubmissionDetailsPanel({
  detailsOpen,
  onDetailsToggle,
  orientationOpen,
  onOrientationToggle,
  faceDirections,
  onToggleFaceDirection,
  owner,
  contributors,
  history,
  canEditCredit,
  isAnonymous,
  onAnonymousChange,
  creditPlatform,
  onCreditPlatformChange,
  creditHandle,
  onCreditHandleChange,
}: SubmissionDetailsPanelProps) {
  return (
    <CollapsiblePanel
      title="More details"
      subtitle="Orientation, community safeguards, and credit settings."
      open={detailsOpen}
      onToggle={onDetailsToggle}
    >
      <CollapsiblePanel
        title="Set Orientation"
        subtitle="Optional metadata for this image."
        open={orientationOpen}
        onToggle={onOrientationToggle}
      >
        <OrientationPicker directions={faceDirections} onToggle={onToggleFaceDirection} />
      </CollapsiblePanel>

      <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Community editing</h2>
          </div>
        </div>
        <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
          <p className="text-xs text-blue-700 dark:text-blue-300">
            Grades are set by community consensus. High-risk edits are blocked automatically, and suspicious edits may be flagged.
          </p>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Owner</p>
            <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">{owner?.displayName || 'Unknown uploader'}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{owner?.username ? `@${owner.username}` : 'Original uploader'}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Contributors</p>
            {contributors.length > 0 ? contributors.map((contributor) => (
              <p key={contributor.userId} className="mt-1 text-gray-900 dark:text-gray-100">
                {contributor.displayName}{contributor.username ? ` (@${contributor.username})` : ''}
              </p>
            )) : <p className="mt-1">No community edits yet.</p>}
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Recent history</p>
            {history.length > 0 ? history.map((entry) => (
              <div key={entry.id} className="mt-2 rounded-md border border-gray-200 px-2 py-2 text-xs dark:border-gray-800">
                <p className="font-medium text-gray-900 dark:text-gray-100">{entry.summary}</p>
                <p className="mt-1 text-gray-500 dark:text-gray-400">{entry.editor.displayName} • {new Date(entry.createdAt).toLocaleString()}</p>
              </div>
            )) : <p className="mt-1">No edit history yet.</p>}
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Contribution credit</h2>
        </div>
        <CreditSection
          canEdit={canEditCredit}
          isAnonymous={isAnonymous}
          onAnonymousChange={onAnonymousChange}
          creditPlatform={creditPlatform}
          onPlatformChange={onCreditPlatformChange}
          creditHandle={creditHandle}
          onHandleChange={onCreditHandleChange}
          anonymousLabel="Keep this submission anonymous"
          anonymousDescription="This removes the upload from your public profile and hides your submitter name and credit link on the climb page."
          readOnlyMessage="Only the original contributor can edit contribution credit."
        />
      </div>
    </CollapsiblePanel>
  )
}
