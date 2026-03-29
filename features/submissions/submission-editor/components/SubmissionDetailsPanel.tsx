'use client'

import { Users } from 'lucide-react'
import { CollapsiblePanel } from '@/features/submissions/components/editor/collapsible-panel'
import { CreditSection } from '@/features/submissions/components/editor/credit-section'
import { OrientationPicker } from '@/features/submissions/components/editor/orientation-picker'
import type { SubmissionCreditPlatform } from '@/features/submissions/lib/submission-credit'
import type { FaceDirection } from '@/features/submissions/lib/submission-types'

interface SubmissionDetailsPanelProps {
  detailsOpen: boolean
  onDetailsToggle: () => void
  orientationOpen: boolean
  onOrientationToggle: () => void
  faceDirections: FaceDirection[]
  onToggleFaceDirection: (direction: FaceDirection) => void
  onShareOpen: () => void
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
  onShareOpen,
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
      subtitle="Orientation, collaborators, and credit settings."
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
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Collaborators</h2>
          </div>
          <button
            type="button"
            onClick={onShareOpen}
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-900"
          >
            Manage collaborators
          </button>
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
