'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { User } from '@supabase/supabase-js'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DataExportSection } from './DataExportSection'

const LEAVE_REASONS = [
  { value: 'found_better_app', label: 'Found a better app' },
  { value: 'privacy_concerns', label: 'Privacy concerns' },
  { value: 'too_complicated', label: 'Too complicated' },
  { value: 'missing_features', label: 'Missing features' },
  { value: 'technical_issues', label: 'Technical issues' },
  { value: 'stopped_using', label: 'Stopped using' },
  { value: 'other', label: 'Other' },
]

interface PendingDeletion {
  id: string
  scheduled_at: string
  hours_remaining: number
}

interface DeletionFlowProps {
  user: User | null
}

export function DeletionFlow({ user }: DeletionFlowProps) {
  const [step, setStep] = useState<'initial' | 'email_sent' | 'confirm'>('initial')
  const [pendingDeletion, setPendingDeletion] = useState<PendingDeletion | null>(null)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteRouteUploads, setDeleteRouteUploads] = useState(false)
  const [primaryReason, setPrimaryReason] = useState('')
  const [imageCount, setImageCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    checkPendingDeletion()
    fetchImageCount()
  }, [])

  const checkPendingDeletion = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: deletionRequest } = await supabase
      .from('deletion_requests')
      .select('id, scheduled_at')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .is('cancelled_at', null)
      .single()

    if (deletionRequest) {
      const scheduledDate = new Date(deletionRequest.scheduled_at)
      const now = new Date()
      const hoursRemaining = Math.max(0, Math.ceil((scheduledDate.getTime() - now.getTime()) / (1000 * 60 * 60)))
      setPendingDeletion({ id: deletionRequest.id, scheduled_at: deletionRequest.scheduled_at, hours_remaining: hoursRemaining })
    }
  }

  const fetchImageCount = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { count } = await supabase
      .from('images')
      .select('*', { count: 'exact', head: true })
      .eq('created_by', user.id)

    setImageCount(count || 0)
  }

  const handleRequestDeletion = async () => {
    setSendingEmail(true)
    try {
      const response = await fetch('/api/settings/request-deletion', {
        method: 'POST',
      })

      if (!response.ok) {
        const error = await response.json()
        if (error.hours_remaining !== undefined) {
          setPendingDeletion({ id: '', scheduled_at: error.scheduled_at, hours_remaining: error.hours_remaining })
          setStep('email_sent')
        }
        throw new Error(error.error || 'Failed to request deletion')
      }

      const data = await response.json()
      setPendingDeletion({ id: data.request_id, scheduled_at: data.scheduled_at, hours_remaining: 48 })
      setStep('email_sent')
      setDeleteModalOpen(false)
    } catch (error) {
      console.error('Request deletion error:', error)
    } finally {
      setSendingEmail(false)
    }
  }

  const handleConfirmDeletion = async () => {
    if (!primaryReason) return

    setLoading(true)
    try {
      const response = await fetch(`/api/settings/confirm-deletion?request_id=${pendingDeletion?.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delete_route_uploads: deleteRouteUploads, primary_reason: primaryReason }),
      })

      if (!response.ok) throw new Error('Failed to confirm deletion')

      window.location.href = '/settings/deletion-scheduled'
    } catch (error) {
      console.error('Confirm deletion error:', error)
      setLoading(false)
    }
  }

  if (pendingDeletion && pendingDeletion.hours_remaining > 0) {
    return (
      <div className="space-y-6">
        <div className="py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">Delete Account</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Your account deletion is scheduled.
          </p>
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              <strong>Account will be deleted on {new Date(pendingDeletion.scheduled_at).toLocaleDateString()} at {new Date(pendingDeletion.scheduled_at).toLocaleTimeString()}</strong>
            </p>
            <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
              {pendingDeletion.hours_remaining} hours remaining. If you change your mind, simply sign in to cancel.
            </p>
          </div>
          <Button
            variant="outline"
            className="mt-4"
            onClick={async () => {
              await supabase.auth.signOut()
              window.location.href = '/'
            }}
          >
            Sign Out (to Cancel Deletion)
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <DataExportSection userId={user?.id || ''} />

      <div className="py-4">
        <h3 className="text-sm font-medium text-red-600 dark:text-red-400 mb-2">Delete Account</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Permanently delete your account and all associated data. This action cannot be undone.
        </p>

        <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
          <DialogTrigger asChild>
            <Button variant="destructive">Delete Account</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            {step === 'initial' && (
              <>
                <DialogHeader>
                  <DialogTitle>Considering leaving?</DialogTitle>
                  <DialogDescription className="text-left">
                    Before you go, would you like to download a copy of your data?
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
                  <Button variant="outline" onClick={() => setDeleteModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      const response = await fetch('/api/settings/export-data')
                      if (!response.ok) return
                      const blob = await response.blob()
                      const url = window.URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = `gsyrocks-data-${new Date().toISOString().split('T')[0]}.json`
                      a.click()
                    }}
                  >
                    Download My Data
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleRequestDeletion}
                    disabled={sendingEmail}
                  >
                    {sendingEmail ? 'Sending...' : 'Continue to Deletion'}
                  </Button>
                </DialogFooter>
              </>
            )}

            {step === 'email_sent' && (
              <>
                <DialogHeader>
                  <DialogTitle>Check your email</DialogTitle>
                  <DialogDescription className="text-left">
                    We&apos;ve sent a verification link to <strong>{user?.email}</strong>.
                    <br /><br />
                    Click the link in the email to confirm your account deletion.
                    You have 48 hours to confirm before the request expires.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDeleteModalOpen(false)}>
                    Close
                  </Button>
                </DialogFooter>
              </>
            )}

            {step === 'confirm' && (
              <>
                <DialogHeader>
                  <DialogTitle>Confirm permanent deletion</DialogTitle>
                  <DialogDescription className="text-left">
                    <div className="mt-2 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg">
                      <label className="flex items-start gap-3 cursor-pointer">
                        <Checkbox
                          checked={deleteRouteUploads}
                          onCheckedChange={(checked) => setDeleteRouteUploads(checked === true)}
                        />
                        <div className="text-sm">
                          <span className="font-medium text-gray-900 dark:text-white">
                            Also delete my uploaded images
                          </span>
                          {imageCount !== null && (
                            <p className="text-gray-500 dark:text-gray-400 mt-0.5">
                              {imageCount} images will be permanently deleted
                            </p>
                          )}
                          {imageCount === 0 && (
                            <p className="text-gray-500 dark:text-gray-400 mt-0.5">
                              No images to delete
                            </p>
                          )}
                          {!deleteRouteUploads && imageCount !== null && imageCount > 0 && (
                            <p className="text-gray-500 dark:text-gray-400 mt-0.5">
                              Your images will remain but become anonymous
                            </p>
                          )}
                        </div>
                      </label>
                    </div>

                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                        Primary reason for leaving <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={primaryReason}
                        onChange={(e) => setPrimaryReason(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        required
                      >
                        <option value="">Select a reason</option>
                        {LEAVE_REASONS.map((reason) => (
                          <option key={reason.value} value={reason.value}>
                            {reason.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <p className="mt-4 text-sm text-red-600 dark:text-red-400 font-medium">
                      This action cannot be undone. Your account will be permanently deleted.
                    </p>
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDeleteModalOpen(false)
                      setStep('initial')
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleConfirmDeletion}
                    disabled={!primaryReason || loading}
                  >
                    {loading ? 'Confirming...' : 'Delete Forever'}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}

export function ConfirmDeletionHandler() {
  const [initialized, setInitialized] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const requestId = urlParams.get('request_id')

    if (requestId && !initialized) {
      setInitialized(true)
      setDeleteModalOpen(true)
      setStep('confirm')
    }
  }, [initialized])

  return null
}

let deleteModalOpen = false
let setDeleteModalOpen: (open: boolean) => void = () => {}
let step: 'initial' | 'email_sent' | 'confirm' = 'initial'
let setStep: (s: 'initial' | 'email_sent' | 'confirm') => void = () => {}

export function setDeletionModalState(
  isOpen: boolean,
  setOpen: (open: boolean) => void,
  currentStep: 'initial' | 'email_sent' | 'confirm',
  setCurrentStep: (s: 'initial' | 'email_sent' | 'confirm') => void
) {
  deleteModalOpen = isOpen
  setDeleteModalOpen = setOpen
  step = currentStep
  setStep = setCurrentStep
}
