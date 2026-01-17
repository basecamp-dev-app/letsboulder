'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { User } from '@supabase/supabase-js'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { csrfFetch } from '@/hooks/useCsrf'

interface DeletionFlowProps {
  user: User
}

const CONFIRMATION_TEXT = 'delete my account'

export function DeletionFlow({ user }: DeletionFlowProps) {
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteRouteUploads, setDeleteRouteUploads] = useState(false)
  const [imageCount, setImageCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [sent, setSent] = useState(false)
  const supabase = createClient()

  const fetchImageCount = useCallback(async () => {
    const { count } = await supabase
      .from('images')
      .select('*', { count: 'exact', head: true })
      .eq('created_by', user.id)

    setImageCount(count || 0)
  }, [user.id, supabase])

  useEffect(() => {
    fetchImageCount()
  }, [fetchImageCount])

  const handleExportData = async () => {
    const response = await fetch('/api/settings/export-data')
    if (!response.ok) return
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `gsyrocks-data-${new Date().toISOString().split('T')[0]}.json`
    a.click()
  }

  const handleInitiateDelete = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (deleteRouteUploads) {
        params.set('delete_route_uploads', 'true')
      }

      const response = await csrfFetch(`/api/settings/initiate-delete?${params.toString()}`, {
        method: 'POST',
      })

      if (!response.ok) {
        throw new Error('Failed to send confirmation email')
      }

      setSent(true)
    } catch (error) {
      console.error('Initiate delete error:', error)
      setLoading(false)
    }
  }

  const isConfirmed = confirmText.toLowerCase().trim() === CONFIRMATION_TEXT

  if (sent) {
    return (
      <div className="space-y-6">
        <div className="py-4">
          <h3 className="text-sm font-medium text-red-600 dark:text-red-400 mb-2">Delete Account</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Permanently delete your account and all associated data. This action cannot be undone.
          </p>
        </div>
        <div className="p-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-center">
          <svg className="w-12 h-12 text-green-600 dark:text-green-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <h3 className="text-lg font-medium text-green-800 dark:text-green-200 mb-2">Confirmation Email Sent</h3>
          <p className="text-sm text-green-700 dark:text-green-300 mb-4">
            Check your email at <span className="font-medium">{user?.email}</span> and click the link to confirm account deletion.
          </p>
          <p className="text-xs text-green-600 dark:text-green-400">
            The link will expire in 10 minutes.
          </p>
        </div>
        <Button variant="outline" onClick={() => setSent(false)}>
          Send Again
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
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
            <DialogHeader>
              <DialogTitle>Delete Account?</DialogTitle>
              <DialogDescription className="text-left">
                This will permanently delete your account and all of your data, including:
                <ul className="list-disc pl-5 mt-2 space-y-1 text-sm">
                  <li>Your profile and climb logs</li>
                  <li>Grade votes and verifications</li>
                  <li>Climb corrections and reports</li>
                  <li>Your avatar image</li>
                </ul>

                <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <Checkbox
                      checked={deleteRouteUploads}
                      onCheckedChange={(checked) => setDeleteRouteUploads(checked === true)}
                    />
                    <div className="text-sm">
                      <span className="font-medium text-gray-900 dark:text-white">
                        Also delete my uploaded images
                      </span>
                      {imageCount !== null && imageCount > 0 && (
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

                <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-sm font-medium text-red-800 dark:text-red-200 mb-2">
                    To confirm, type: <code className="bg-red-100 dark:bg-red-800 px-2 py-0.5 rounded">{CONFIRMATION_TEXT}</code>
                  </p>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder={CONFIRMATION_TEXT}
                    className="w-full px-3 py-2 border border-red-300 dark:border-red-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400"
                  />
                </div>

                <p className="mt-4 font-medium text-red-600 dark:text-red-400">
                  This action cannot be undone. A confirmation email will be sent.
                </p>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
              <Button variant="outline" onClick={() => {
                setDeleteModalOpen(false)
                setConfirmText('')
              }}>
                Cancel
              </Button>
              <Button variant="secondary" onClick={handleExportData}>
                Download My Data
              </Button>
              <Button
                variant="destructive"
                onClick={handleInitiateDelete}
                disabled={!isConfirmed || loading}
              >
                {loading ? 'Sending...' : 'Send Confirmation Email'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
