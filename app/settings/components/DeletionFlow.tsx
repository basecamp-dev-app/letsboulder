'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { User } from '@supabase/supabase-js'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'

interface DeletionFlowProps {
  user: User | null
}

const CONFIRMATION_TEXT = 'delete my account'

export function DeletionFlow({ user }: DeletionFlowProps) {
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteRouteUploads, setDeleteRouteUploads] = useState(false)
  const [imageCount, setImageCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const supabase = createClient()

  useEffect(() => {
    fetchImageCount()
  }, [])

  const fetchImageCount = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { count } = await supabase
      .from('images')
      .select('*', { count: 'exact', head: true })
      .eq('created_by', user.id)

    setImageCount(count || 0)
  }

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

  const handleDeleteAccount = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (deleteRouteUploads) {
        params.set('delete_route_uploads', 'true')
      }

      const response = await fetch(`/api/settings/delete?${params.toString()}`, {
        method: 'DELETE',
      })

      if (!response.ok) throw new Error('Failed to delete account')

      window.location.href = '/settings/delete-success'
    } catch (error) {
      console.error('Delete account error:', error)
      setLoading(false)
    }
  }

  const isConfirmed = confirmText.toLowerCase().trim() === CONFIRMATION_TEXT

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
                  This action cannot be undone.
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
                onClick={handleDeleteAccount}
                disabled={!isConfirmed || loading}
              >
                {loading ? 'Deleting...' : 'Delete Forever'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
