'use client'

import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { User } from '@supabase/supabase-js'
import { Loader2 } from 'lucide-react'
import SupportCard from '@/components/SupportCard'
import { Button } from '@/components/ui/button'
import { csrfFetch } from '@/hooks/useCsrf'
import { saveSettingsAction } from '@/features/settings/actions/save-settings'
import { updateGradePreferences } from '@/features/grades/hooks/useGradeSystem'
import { useOverlayHistory } from '@/hooks/useOverlayHistory'
import type { GradeSystem } from '@/lib/grade-display'
import { formatLengthInputFromCm, parseLengthInputToCm, type MeasurementUnits } from '@/lib/measurement-units'
import { fetchSettings, settingsQueryKey, type SettingsPayload } from '@/features/settings/lib/queries'
import { normalizeSubmissionCreditHandle, type SubmissionCreditPlatform } from '@/features/submissions/lib/submission-credit'
import { AppearanceSettingsSection } from '@/app/(shell)/settings/components/AppearanceSettingsSection'
import { PrivacySettingsSection } from '@/app/(shell)/settings/components/PrivacySettingsSection'
import { ProfileSettingsSection } from '@/app/(shell)/settings/components/ProfileSettingsSection'
import { SettingsTabs } from '@/app/(shell)/settings/components/SettingsTabs'
import type { GradeOption, SettingsProfileFormData, SettingsTab } from '@/app/(shell)/settings/components/settings-content.types'
import { UnitsSettingsSection } from '@/app/(shell)/settings/components/UnitsSettingsSection'
import { reportError } from '@/lib/errors'

interface SettingsContentProps {
  user: User
}

const CONFIRMATION_TEXT = 'delete my account'

function Toast({ message, onClose }: { message: string | null; onClose: () => void }) {
  useEffect(() => {
    if (message) {
      const timer = setTimeout(onClose, 2000)
      return () => clearTimeout(timer)
    }
  }, [message, onClose])

  if (!message) return null

  return (
    <div className="fixed bottom-4 right-4 p-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg shadow-lg text-sm z-50">
      {message}
    </div>
  )
}

const TABS: SettingsTab[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'units', label: 'Units' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'privacy', label: 'Privacy' },
]

const BOULDER_GRADE_OPTIONS: GradeOption[] = [
  { value: 'v_scale', label: 'V Scale (USA)', sample: 'V5' },
  { value: 'font_scale', label: 'Font (Europe)', sample: '6C+' },
]

const ROUTE_GRADE_OPTIONS: GradeOption[] = [
  { value: 'yds_equivalent', label: 'YDS (USA)', sample: '5.12a' },
  { value: 'french_equivalent', label: 'French (Europe)', sample: '7a' },
  { value: 'british_equivalent', label: 'British (E-grades)', sample: 'E5' },
]

const TRAD_GRADE_OPTIONS: GradeOption[] = [
  { value: 'yds_equivalent', label: 'YDS (USA)', sample: '5.10c' },
  { value: 'french_equivalent', label: 'French (Europe)', sample: '6b+' },
  { value: 'british_equivalent', label: 'British (E-grades)', sample: 'E3' },
]

export default function SettingsContent({ user }: SettingsContentProps) {
  const queryClient = useQueryClient()
  const hasHydratedFormRef = useRef(false)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('profile')

  const [formData, setFormData] = useState<SettingsProfileFormData>({
    firstName: '',
    lastName: '',
    gender: 'prefer_not_to_say',
    heightCm: '',
    reachCm: '',
    bio: '',
    contributionCreditPlatform: 'instagram' as SubmissionCreditPlatform,
    contributionCreditHandle: '',
  })
  const [isDirty, setIsDirty] = useState(false)
  const [isPublic, setIsPublic] = useState(true)

  const [themePreference, setThemePreference] = useState('system')
  const [units, setUnits] = useState<MeasurementUnits>('metric')
  const [boulderSystem, setBoulderSystem] = useState<GradeSystem>('v_scale')
  const [routeSystem, setRouteSystem] = useState<GradeSystem>('yds_equivalent')
  const [tradSystem, setTradSystem] = useState<GradeSystem>('yds_equivalent')

  const [toast, setToast] = useState<string | null>(null)
  const [saveLoading, setSaveLoading] = useState(false)

  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteRouteUploads, setDeleteRouteUploads] = useState(false)
  const [imageCount, setImageCount] = useState<number>(0)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [deleteSent, setDeleteSent] = useState(false)
  const { data, isLoading, error } = useQuery({
    queryKey: settingsQueryKey,
    queryFn: fetchSettings,
    meta: {
      persist: true,
    },
  })

  useOverlayHistory({
    open: deleteModalOpen,
    onClose: () => {
      setDeleteModalOpen(false)
      setConfirmText('')
    },
    id: 'delete-account-dialog',
  })

  useEffect(() => {
    if (error) {
      reportError(error, { message: 'Error fetching settings' })
    }
  }, [error])

  useEffect(() => {
    if (!data?.settings) {
      setLoading(isLoading)
      return
    }

    if (hasHydratedFormRef.current && isDirty) {
      setLoading(isLoading)
      return
    }

    setFormData({
      firstName: data.settings.firstName || '',
      lastName: data.settings.lastName || '',
      gender: data.settings.gender || 'prefer_not_to_say',
      heightCm: formatLengthInputFromCm(data.settings.heightCm, (data.settings.units || 'metric') as MeasurementUnits),
      reachCm: formatLengthInputFromCm(data.settings.reachCm, (data.settings.units || 'metric') as MeasurementUnits),
      bio: data.settings.bio || '',
      contributionCreditPlatform: (data.settings.contributionCreditPlatform || 'instagram') as SubmissionCreditPlatform,
      contributionCreditHandle: data.settings.contributionCreditHandle || '',
    })
    setIsPublic(data.settings.isPublic !== false)
    setThemePreference(data.settings.themePreference || 'system')
    setUnits((data.settings.units || 'metric') as MeasurementUnits)
    setBoulderSystem((data.settings.boulderSystem || 'v_scale') as GradeSystem)
    setRouteSystem((data.settings.routeSystem || 'yds_equivalent') as GradeSystem)
    setTradSystem((data.settings.tradSystem || 'yds_equivalent') as GradeSystem)
    setImageCount(data.imageCount || 0)
    updateGradePreferences({
      boulder: (data.settings.boulderSystem || 'v_scale') as GradeSystem,
      route: (data.settings.routeSystem || 'yds_equivalent') as GradeSystem,
      trad: (data.settings.tradSystem || 'yds_equivalent') as GradeSystem,
    })
    hasHydratedFormRef.current = true
    setLoading(isLoading)
  }, [data, isDirty, isLoading])

  const syncSettingsCache = (nextSettings: SettingsPayload['settings']) => {
    queryClient.setQueryData<SettingsPayload>(settingsQueryKey, (current) => {
      if (!current) {
        return {
          settings: nextSettings,
          imageCount,
        }
      }

      return {
        ...current,
        settings: {
          ...current.settings,
          ...nextSettings,
        },
      }
    })
  }

  const handleFormChange = (field: keyof SettingsProfileFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    setIsDirty(true)
  }

  const handleUnitsChange = (nextUnits: MeasurementUnits) => {
    setFormData((prev) => ({
      ...prev,
      heightCm: formatLengthInputFromCm(parseLengthInputToCm(prev.heightCm, units), nextUnits),
      reachCm: formatLengthInputFromCm(parseLengthInputToCm(prev.reachCm, units), nextUnits),
    }))
    setUnits(nextUnits)
    setIsDirty(true)
  }

  const handleDeleteModalOpenChange = (open: boolean) => {
    setDeleteModalOpen(open)
    if (!open) {
      setConfirmText('')
    }
  }

  const handleDeleteCancel = () => {
    setDeleteModalOpen(false)
    setConfirmText('')
  }

  const handleSave = async () => {
    setSaveLoading(true)
    try {
      const result = await saveSettingsAction({
        firstName: formData.firstName,
        lastName: formData.lastName,
        gender: formData.gender,
        heightCm: parseLengthInputToCm(formData.heightCm, units),
        reachCm: parseLengthInputToCm(formData.reachCm, units),
        bio: formData.bio,
        contributionCreditPlatform: formData.contributionCreditHandle.trim()
          ? formData.contributionCreditPlatform
          : null,
        contributionCreditHandle: formData.contributionCreditHandle,
        isPublic,
        themePreference,
        units,
        boulderSystem,
        routeSystem,
        tradSystem,
      })

      if (!result.success) {
        if (result.error) {
          setToast(result.error)
          return
        }
        throw new Error('Failed to save')
      }

      syncSettingsCache({
        ...(data?.settings || {
          username: '',
          avatarUrl: '',
          defaultLocation: '',
          defaultLocationName: '',
          defaultLocationLat: null,
          defaultLocationLng: null,
          defaultLocationZoom: null,
        }),
        firstName: formData.firstName,
        lastName: formData.lastName,
        gender: formData.gender,
        heightCm: parseLengthInputToCm(formData.heightCm, units),
        reachCm: parseLengthInputToCm(formData.reachCm, units),
        bio: formData.bio,
        boulderSystem,
        routeSystem,
        tradSystem,
        units,
        isPublic,
        themePreference,
        contributionCreditPlatform: formData.contributionCreditHandle.trim()
          ? formData.contributionCreditPlatform
          : '',
        contributionCreditHandle: normalizeSubmissionCreditHandle(formData.contributionCreditHandle) || '',
      })

      setIsDirty(false)
      setToast(result.data?.warning || 'Saved')
    } catch {
      setToast('Failed to save')
    } finally {
      setSaveLoading(false)
    }
  }

  const handleThemeChange = async (theme: string) => {
    setThemePreference(theme)
    setIsDirty(true)

    if (theme !== 'system') {
      document.documentElement.classList.remove('dark')
      if (theme === 'dark') {
        document.documentElement.classList.add('dark')
      }
    }
  }

  const handleVisibilityToggle = async () => {
    const newValue = !isPublic
    setIsPublic(newValue)
    setIsDirty(true)
  }

  const handleBoulderSystemChange = (next: GradeSystem) => {
    setBoulderSystem(next)
    updateGradePreferences({ boulder: next })
    setIsDirty(true)
  }

  const handleRouteSystemChange = (next: GradeSystem) => {
    setRouteSystem(next)
    updateGradePreferences({ route: next })
    setIsDirty(true)
  }

  const handleTradSystemChange = (next: GradeSystem) => {
    setTradSystem(next)
    updateGradePreferences({ trad: next })
    setIsDirty(true)
  }

  const handleInitiateDelete = async () => {
    setDeleteLoading(true)
    try {
      const params = new URLSearchParams()
      if (deleteRouteUploads) {
        params.set('delete_route_uploads', 'true')
      }

      const response = await csrfFetch(`/api/settings/initiate-delete?${params.toString()}`, {
        method: 'POST'
      })

      if (!response.ok) throw new Error('Failed to send confirmation email')
      setDeleteSent(true)
    } catch (error) {
      reportError(error, { message: 'Initiate delete error' })
      setDeleteLoading(false)
    }
  }

  const isConfirmed = confirmText.toLowerCase().trim() === CONFIRMATION_TEXT

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950">
        <div className="px-0">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 px-4 py-3 border-b border-gray-200 dark:border-gray-800 sticky top-[var(--app-header-offset)] bg-white dark:bg-gray-950 z-10">
            Settings
          </h1>
          <div className="p-4 space-y-4 animate-pulse">
            <div className="h-10 bg-gray-200 dark:bg-gray-800 rounded w-1/3" />
            <div className="h-32 bg-gray-200 dark:bg-gray-800 rounded" />
            <div className="h-10 bg-gray-200 dark:bg-gray-800 rounded w-1/3" />
            <div className="h-32 bg-gray-200 dark:bg-gray-800 rounded" />
          </div>
        </div>
      </div>
    )
  }

  if (deleteSent) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950">
        <div className="px-0">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 px-4 py-3 border-b border-gray-200 dark:border-gray-800 sticky top-[var(--app-header-offset)] bg-white dark:bg-gray-950 z-10">
            Settings
          </h1>
          <div className="p-4">
            <div className="p-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-center max-w-2xl mx-auto">
              <svg className="w-12 h-12 text-green-600 dark:text-green-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <h3 className="text-lg font-medium text-green-800 dark:text-green-200 mb-2">Confirmation Email Sent</h3>
              <p className="text-sm text-green-700 dark:text-green-300 mb-4">
                Check your email at <span className="font-medium">{user?.email}</span> and click the link to confirm account deletion.
              </p>
              <p className="text-xs text-green-600 dark:text-green-400">The link will expire in 10 minutes.</p>
            </div>
            <div className="mt-4 text-center">
              <Button variant="outline" onClick={() => setDeleteSent(false)}>Send Again</Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <div className="px-0">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 px-4 py-3 border-b border-gray-200 dark:border-gray-800 sticky top-[var(--app-header-offset)] bg-white dark:bg-gray-950 z-10">
          Settings
        </h1>

        <div className="bg-white dark:bg-gray-900 border-x-0 border-t-0 rounded-none">
          <SettingsTabs activeTab={activeTab} tabs={TABS} onTabChange={setActiveTab} />

          <div className="p-6">
            {activeTab === 'profile' && (
              <ProfileSettingsSection formData={formData} units={units} onFieldChange={handleFormChange} />
            )}

            {activeTab === 'units' && (
              <UnitsSettingsSection
                units={units}
                onUnitsChange={handleUnitsChange}
                boulderSystem={boulderSystem}
                routeSystem={routeSystem}
                tradSystem={tradSystem}
                boulderOptions={BOULDER_GRADE_OPTIONS}
                routeOptions={ROUTE_GRADE_OPTIONS}
                tradOptions={TRAD_GRADE_OPTIONS}
                onBoulderSystemChange={handleBoulderSystemChange}
                onRouteSystemChange={handleRouteSystemChange}
                onTradSystemChange={handleTradSystemChange}
              />
            )}

            {activeTab === 'appearance' && (
              <AppearanceSettingsSection themePreference={themePreference} onThemeChange={handleThemeChange} />
            )}

            {activeTab === 'privacy' && (
              <PrivacySettingsSection
                isPublic={isPublic}
                onToggleVisibility={handleVisibilityToggle}
                deleteModalOpen={deleteModalOpen}
                onDeleteModalOpenChange={handleDeleteModalOpenChange}
                deleteRouteUploads={deleteRouteUploads}
                onDeleteRouteUploadsChange={setDeleteRouteUploads}
                imageCount={imageCount}
                confirmationText={CONFIRMATION_TEXT}
                confirmText={confirmText}
                onConfirmTextChange={setConfirmText}
                isConfirmed={isConfirmed}
                deleteLoading={deleteLoading}
                onInitiateDelete={handleInitiateDelete}
                onCancelDelete={handleDeleteCancel}
              />
            )}

            <div className="mt-10 max-w-xl border-t border-gray-200 pt-8 dark:border-gray-700">
              <SupportCard compact />
            </div>
          </div>

          <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex justify-end">
            <Button
              onClick={handleSave}
              disabled={!isDirty || saveLoading}
              className="min-w-[120px]"
            >
              {saveLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </div>
        </div>
      </div>

      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  )
}
