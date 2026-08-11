'use client'

import { Users } from 'lucide-react'
import { CreditSection } from '@/features/submissions/public-client'
import { OrientationPicker } from '@/features/submissions/public-client'
import type { SubmissionCreditPlatform } from '@/features/submissions/public-client'
import type { FaceDirection } from '@/features/submissions/public-client'

interface DraftDetailsPanelProps {
  detailsOpen: boolean
  onDetailsToggle: () => void
  orientationOpen: boolean
  onOrientationToggle: () => void
  activeImageOrientation: FaceDirection[]
  onToggleOrientation: (direction: FaceDirection) => void
  onShareOpen: () => void
  canEditCredit: boolean
  isAnonymous: boolean
  onAnonymousChange: (value: boolean) => void
  creditPlatform: SubmissionCreditPlatform
  onCreditPlatformChange: (value: SubmissionCreditPlatform) => void
  creditHandle: string
  onCreditHandleChange: (value: string) => void
}

export function DraftDetailsPanel({
  detailsOpen,
  onDetailsToggle,
  orientationOpen,
  onOrientationToggle,
  activeImageOrientation,
  onToggleOrientation,
  onShareOpen,
  canEditCredit,
  isAnonymous,
  onAnonymousChange,
  creditPlatform,
  onCreditPlatformChange,
  creditHandle,
  onCreditHandleChange,
}: DraftDetailsPanelProps) {
  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
      <button
        type="button"
        onClick={onDetailsToggle}
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={detailsOpen}
      >
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">More details</h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Orientation, collaborators, and credit settings.</p>
        </div>
        <svg className={`h-4 w-4 shrink-0 text-gray-500 transition-transform dark:text-gray-400 ${detailsOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
      </button>

      {detailsOpen ? (
        <div className="mt-3 space-y-3">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950/40">
            <button
              type="button"
              onClick={onOrientationToggle}
              className="flex w-full items-center justify-between gap-3 text-left"
              aria-expanded={orientationOpen}
            >
              <div>
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Set Orientation</h2>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Optional metadata for each image.</p>
              </div>
              <svg className={`h-4 w-4 shrink-0 text-gray-500 transition-transform dark:text-gray-400 ${orientationOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
            </button>
            {orientationOpen ? (
              <div className="mt-3">
                <OrientationPicker directions={activeImageOrientation} onToggle={onToggleOrientation} />
              </div>
            ) : null}
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950/40">
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

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950/40">
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
              anonymousLabel="Publish anonymously"
              anonymousDescription="Your upload stays editable in your logbook, but your public profile, submitter name, and credit link stay hidden."
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
