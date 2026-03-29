'use client'

import { normalizeSubmissionCreditHandle, type SubmissionCreditPlatform } from '@/lib/submission-credit'
import { CREDIT_PLATFORM_OPTIONS } from '@/lib/editor-types'

interface CreditSectionProps {
  canEdit: boolean
  isAnonymous: boolean
  onAnonymousChange: (value: boolean) => void
  creditPlatform: SubmissionCreditPlatform
  onPlatformChange: (value: SubmissionCreditPlatform) => void
  creditHandle: string
  onHandleChange: (value: string) => void
  anonymousLabel?: string
  anonymousDescription?: string
  readOnlyMessage?: string
}

export function CreditSection({
  canEdit,
  isAnonymous,
  onAnonymousChange,
  creditPlatform,
  onPlatformChange,
  creditHandle,
  onHandleChange,
  anonymousLabel = 'Publish anonymously',
  anonymousDescription = 'Your upload stays editable in your logbook, but your public profile, submitter name, and credit link stay hidden.',
  readOnlyMessage = 'Only the original contributor can edit contribution credit.',
}: CreditSectionProps) {
  if (!canEdit) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">{readOnlyMessage}</p>
    )
  }

  return (
    <>
      <label className="mb-3 flex items-start gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-200">
        <input
          type="checkbox"
          checked={isAnonymous}
          onChange={(event) => onAnonymousChange(event.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800"
        />
        <span>
          <span className="block font-medium text-gray-900 dark:text-gray-100">{anonymousLabel}</span>
          <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">{anonymousDescription}</span>
        </span>
      </label>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className="text-xs text-gray-600 dark:text-gray-300">
          Platform
          <select
            value={creditPlatform}
            onChange={(event) => onPlatformChange(event.target.value as SubmissionCreditPlatform)}
            disabled={isAnonymous}
            className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          >
            {CREDIT_PLATFORM_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-600 dark:text-gray-300 md:col-span-2">
          Handle
          <input
            value={creditHandle}
            onChange={(event) => onHandleChange(event.target.value)}
            placeholder="handle"
            disabled={isAnonymous}
            className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          />
        </label>
      </div>
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        {isAnonymous
          ? 'Credit is hidden while anonymous mode is on.'
          : `Shown publicly as @${normalizeSubmissionCreditHandle(creditHandle) || 'handle'}`}
      </p>
    </>
  )
}
