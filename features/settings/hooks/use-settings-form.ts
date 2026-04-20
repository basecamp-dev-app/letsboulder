'use client'

import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { saveSettingsAction } from '@/features/settings/actions/save-settings'
import { settingsQueryKey, type SettingsPayload } from '@/features/settings/lib/queries'
import { reportError } from '@/lib/errors'
import type { GradeSystem } from '@/lib/grade-display'
import { updateGradePreferences } from '@/lib/grades/preferences'
import { formatLengthInputFromCm, parseLengthInputToCm, type MeasurementUnits } from '@/lib/measurement-units'
import { normalizeSubmissionCreditHandle, type SubmissionCreditPlatform } from '@/lib/submission-credit'
import { csrfFetch } from '@/hooks/useCsrf'

interface UseSettingsFormParams {
  data: SettingsPayload | undefined
  isLoading: boolean
  error: unknown
}

export function useSettingsForm({ data, isLoading, error }: UseSettingsFormParams) {
  const queryClient = useQueryClient()
  const hasHydratedFormRef = useRef(false)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const [saveLoading, setSaveLoading] = useState(false)
  const [isDirty, setIsDirty] = useState(false)

  const [formData, setFormData] = useState({
    avatarUrl: '',
    firstName: '',
    lastName: '',
    gender: 'prefer_not_to_say',
    heightCm: '',
    reachCm: '',
    bio: '',
    contributionCreditPlatform: 'instagram' as SubmissionCreditPlatform,
    contributionCreditHandle: '',
  })
  const [isPublic, setIsPublic] = useState(true)
  const [themePreference, setThemePreference] = useState('system')
  const [units, setUnits] = useState<MeasurementUnits>('metric')
  const [boulderSystem, setBoulderSystem] = useState<GradeSystem>('v_scale')
  const [routeSystem, setRouteSystem] = useState<GradeSystem>('yds_equivalent')
  const [tradSystem, setTradSystem] = useState<GradeSystem>('yds_equivalent')
  const [imageCount, setImageCount] = useState(0)

  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteRouteUploads, setDeleteRouteUploads] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [deleteSent, setDeleteSent] = useState(false)

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
      avatarUrl: data.settings.avatarUrl || '',
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

  const handleFormChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    setIsDirty(true)
  }

  const handleAvatarUpdate = (avatarUrl: string) => {
    setFormData((prev) => ({ ...prev, avatarUrl }))
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
      avatarUrl,
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

  const handleThemeChange = (theme: string) => {
    setThemePreference(theme)
    setIsDirty(true)

    if (theme !== 'system') {
      document.documentElement.classList.remove('dark')
      if (theme === 'dark') {
        document.documentElement.classList.add('dark')
      }
    }
  }

  const handleVisibilityToggle = () => {
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

  const handleDeleteCancel = () => {
    setDeleteModalOpen(false)
    setConfirmText('')
  }

  const handleDeleteModalOpenChange = (open: boolean) => {
    setDeleteModalOpen(open)
    if (!open) {
      setConfirmText('')
      setDeleteLoading(false)
      setDeleteSent(false)
    }
  }

  return {
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
    deleteSent,
    setDeleteSent,
    setDeleteRouteUploads,
    isConfirmed: confirmText.trim().toLowerCase() === 'delete my account',
    handleFormChange,
    handleAvatarUpdate,
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
    setConfirmText,
  }
}
