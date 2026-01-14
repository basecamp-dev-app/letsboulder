'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { User } from '@supabase/supabase-js'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'

interface AccountActionsSectionProps {
  user: User | null
}

export function AccountActionsSection({ user }: AccountActionsSectionProps) {
  const router = useRouter()
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteRouteUploads, setDeleteRouteUploads] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleDeleteAccount = async () => {
    setDeleting(true)

    try {
      const params = new URLSearchParams()
      if (deleteRouteUploads) {
        params.set('delete_route_uploads', 'true')
      }

      const response = await fetch(`/api/settings/delete?${params.toString()}`, {
        method: 'DELETE'
      })

      if (!response.ok) throw new Error('Failed to delete account')

      const supabase = createClient()
      await supabase.auth.signOut()
      router.push('/settings/delete-success')
    } catch {
      setDeleting(false)
      setDeleteModalOpen(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Account Actions</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">Manage your account settings.</p>
      </div>

      <div className="space-y-4">
        <div className="py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">Email</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">{user?.email}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500">Contact support to change your email address.</p>
        </div>

        <div className="py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">Password</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Your account uses magic link authentication.</p>
          <p className="text-xs text-gray-400 dark:text-gray-500">No password required - sign in via email link.</p>
        </div>

        <div className="py-4">
          <h3 className="text-sm font-medium text-red-600 dark:text-red-400 mb-2">Delete Account</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Permanently delete your account and all associated data. This action cannot be undone.
          </p>

          <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive">Delete Account</Button>
            </DialogTrigger>
            <DialogContent>
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
                          Also delete my uploaded route images
                        </span>
                        <p className="text-gray-500 dark:text-gray-400 mt-0.5">
                          Remove all route photos I&apos;ve uploaded. If unchecked, your images will remain but become anonymous.
                        </p>
                      </div>
                    </label>
                  </div>
                  <p className="mt-3 font-medium text-red-600 dark:text-red-400">
                    All uploaded images will be permanently deleted.
                  </p>
                  This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteModalOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteAccount}
                  disabled={deleting}
                >
                  {deleting ? 'Deleting...' : 'Delete Account'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  )
}
