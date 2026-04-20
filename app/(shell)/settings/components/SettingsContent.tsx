'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { User } from '@supabase/supabase-js'
import { Loader2 } from 'lucide-react'
import SupportCard from '@/components/SupportCard'
import { Button } from '@/components/ui/button'
import { ToastContainer } from '@/components/ui/toast'
import { AppearanceSettingsSection } from '@/features/settings/components/AppearanceSettingsSection'
import { PrivacySettingsSection } from '@/features/settings/components/PrivacySettingsSection'
import { ProfileSettingsSection } from '@/features/settings/components/ProfileSettingsSection'
import { SettingsTabs } from '@/features/settings/components/SettingsTabs'
import { UnitsSettingsSection } from '@/features/settings/components/UnitsSettingsSection'
import { useSettingsForm } from '@/features/settings/hooks/use-settings-form'
import { fetchSettings, settingsQueryKey } from '@/features/settings/lib/queries'
import type { GradeOption, SettingsTab } from '@/features/settings/types/settings-content'
import { useToast } from '@/hooks/use-toast'

interface SettingsContentProps {
  user: User
}

const CONFIRMATION_TEXT = 'delete my account'

const TABS: SettingsTab[] = [
  { id: 'profile', label: 'Profile', summary: 'Update your public details, physical stats, and default contribution credit.' },
  { id: 'units', label: 'Units', summary: 'Choose measurement units and how grades are displayed across climb types.' },
  { id: 'appearance', label: 'Appearance', summary: 'Set the app theme for light, dark, or system-based viewing.' },
  { id: 'privacy', label: 'Privacy', summary: 'Manage profile visibility and account deletion settings.' },
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
  const { toasts, addToast, removeToast } = useToast()
  const { data, isLoading, error } = useQuery({
    queryKey: settingsQueryKey,
    queryFn: fetchSettings,
  })

  const form = useSettingsForm({ data, isLoading, error })
  const {
    loading,
    toast,
    setToast,
    saveLoading,
    isDirty,
    formData,
    isPublic,
    themePreference,
    units,
    boulderSystem,
    routeSystem,
    tradSystem,
    imageCount,
    deleteModalOpen,
    deleteRouteUploads,
    deleteLoading,
    confirmText,
    setConfirmText,
    deleteSent,
    setDeleteSent,
    setDeleteRouteUploads,
    isConfirmed,
    handleFormChange,
    handleUnitsChange,
    handleSave,
    handleThemeChange,
    handleVisibilityToggle,
    handleBoulderSystemChange,
    handleRouteSystemChange,
    handleTradSystemChange,
    handleInitiateDelete,
    handleDeleteCancel,
    handleDeleteModalOpenChange,
  } = form

  useEffect(() => {
    if (!toast) return
    addToast(toast, toast === 'Saved' ? 'success' : 'error')
    setToast(null)
  }, [addToast, setToast, toast])

  const [activeTab, setActiveTab] = useState('profile')
  const activeTabConfig = TABS.find((tab) => tab.id === activeTab) ?? TABS[0]

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950">
        <div className="px-0">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 px-4 py-3 border-b border-gray-200 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-950 z-10">
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 px-4 py-3 border-b border-gray-200 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-950 z-10">
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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 px-4 py-3 border-b border-gray-200 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-950 z-10">
          Settings
        </h1>

        <div className="bg-white dark:bg-gray-900 border-x-0 border-t-0 rounded-none">
          <SettingsTabs activeTab={activeTab} tabs={TABS} onTabChange={setActiveTab} />

          <div className="p-6">
            <div className="mb-6 max-w-2xl">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{activeTabConfig.label}</h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{activeTabConfig.summary}</p>
            </div>

            {activeTab === 'profile' && (
              <ProfileSettingsSection
                formData={formData}
                units={units}
                onFieldChange={handleFormChange}
                onAvatarUpdate={form.handleAvatarUpdate}
              />
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

            <div className="mt-10 border-t border-gray-200 pt-6 dark:border-gray-700">
              <div className="flex justify-end">
                <Button
                  onClick={handleSave}
                  disabled={!isDirty || saveLoading}
                  className="min-w-[120px]"
                >
                  {saveLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </Button>
              </div>
            </div>

            <div className="mt-10 max-w-xl border-t border-gray-200 pt-8 dark:border-gray-700">
              <SupportCard compact />
            </div>
          </div>
        </div>
      </div>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  )
}
