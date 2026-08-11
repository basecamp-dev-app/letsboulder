'use client'

import { useMemo, useState } from 'react'
import { ProfileAvatarUploadModal } from '@/components/ProfileAvatarUploadModal'
import { CREDIT_PLATFORM_OPTIONS } from '@/features/submissions/public-client'
import { normalizeSubmissionCreditHandle } from '@/features/submissions/public-client'
import { getLengthInputBounds, getLengthInputLabel, type MeasurementUnits } from '@/lib/measurement-units'
import type { SettingsProfileFormData } from '@/features/settings/types/settings-content'

interface ProfileSettingsSectionProps {
  formData: SettingsProfileFormData
  units: MeasurementUnits
  onFieldChange: (field: keyof SettingsProfileFormData, value: string) => void
  onAvatarUpdate: (avatarUrl: string) => void
}

export function ProfileSettingsSection({ formData, units, onFieldChange, onAvatarUpdate }: ProfileSettingsSectionProps) {
  const heightBounds = getLengthInputBounds(units, 100, 250)
  const reachBounds = getLengthInputBounds(units, 100, 260)
  const lengthLabel = getLengthInputLabel(units)
  const [avatarModalOpen, setAvatarModalOpen] = useState(false)
  const initials = useMemo(() => {
    const firstInitial = formData.firstName.trim().charAt(0)
    const lastInitial = formData.lastName.trim().charAt(0)
    const value = `${firstInitial}${lastInitial}`.toUpperCase()
    return value || 'U'
  }, [formData.firstName, formData.lastName])

  return (
    <div className="space-y-6 max-w-xl">
      <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/60">
        <button
          type="button"
          onClick={() => setAvatarModalOpen(true)}
          className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-200 text-lg font-semibold text-gray-700 transition-opacity hover:opacity-90 dark:bg-gray-700 dark:text-gray-200"
          aria-label="Change profile photo"
        >
          {formData.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={formData.avatarUrl} alt="Profile" className="h-full w-full object-cover" />
          ) : (
            initials
          )}
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 dark:text-white">Profile photo</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Shown on your profile, rankings, and community activity.</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setAvatarModalOpen(true)}
            className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
          >
            Change photo
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="first-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">First Name</label>
          <input
            id="first-name"
            type="text"
            value={formData.firstName}
            onChange={(e) => onFieldChange('firstName', e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-500 focus:border-transparent"
          />
        </div>
        <div>
          <label htmlFor="last-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Last Name</label>
          <input
            id="last-name"
            type="text"
            value={formData.lastName}
            onChange={(e) => onFieldChange('lastName', e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-500 focus:border-transparent"
          />
        </div>
      </div>

      <div>
        <label htmlFor="gender" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Gender</label>
        <select
          id="gender"
          value={formData.gender}
          onChange={(e) => onFieldChange('gender', e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-500 focus:border-transparent"
        >
          <option value="prefer_not_to_say">Prefer not to say</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="other">Other</option>
        </select>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Used for segmented leaderboards</p>
      </div>

      <div>
        <label htmlFor="bio" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bio</label>
        <textarea
          id="bio"
          value={formData.bio}
          onChange={(e) => onFieldChange('bio', e.target.value)}
          rows={4}
          maxLength={500}
          placeholder="Tell us about yourself..."
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-500 focus:border-transparent resize-none"
        />
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{formData.bio.length}/500 characters</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="height-cm" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Height ({lengthLabel})</label>
          <input
            id="height-cm"
            type="number"
            min={heightBounds.min}
            max={heightBounds.max}
            step={heightBounds.step}
            value={formData.heightCm}
            onChange={(e) => onFieldChange('heightCm', e.target.value)}
            placeholder="Optional"
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-500 focus:border-transparent"
          />
        </div>
        <div>
          <label htmlFor="reach-cm" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reach ({lengthLabel})</label>
          <input
            id="reach-cm"
            type="number"
            min={reachBounds.min}
            max={reachBounds.max}
            step={reachBounds.step}
            value={formData.reachCm}
            onChange={(e) => onFieldChange('reachCm', e.target.value)}
            placeholder="Optional"
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-500 focus:border-transparent"
          />
        </div>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400 -mt-3">
        Optional, but adding these helps other climbers find beta videos from people with a similar build.
      </p>

      <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
        <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">Default contribution credit</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Used when a submission has no per-submission credit. Submission credit always takes priority.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <select
            value={formData.contributionCreditPlatform}
            onChange={(e) => onFieldChange('contributionCreditPlatform', e.target.value as SettingsProfileFormData['contributionCreditPlatform'])}
            className="sm:col-span-1 w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-500 focus:border-transparent"
          >
            {CREDIT_PLATFORM_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <input
            type="text"
            value={formData.contributionCreditHandle}
            onChange={(e) => onFieldChange('contributionCreditHandle', e.target.value)}
            placeholder="handle"
            className="sm:col-span-2 w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-500 focus:border-transparent"
          />
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          Shows as @{normalizeSubmissionCreditHandle(formData.contributionCreditHandle) || 'handle'}
        </p>
      </div>

      <ProfileAvatarUploadModal
        open={avatarModalOpen}
        avatarUrl={formData.avatarUrl || undefined}
        initials={initials}
        onClose={() => setAvatarModalOpen(false)}
        onAvatarUpdate={onAvatarUpdate}
      />
    </div>
  )
}
