'use client'

import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

interface PrivacySettingsSectionProps {
  isPublic: boolean
  onToggleVisibility: () => void
  deleteModalOpen: boolean
  onDeleteModalOpenChange: (open: boolean) => void
  deleteRouteUploads: boolean
  onDeleteRouteUploadsChange: (checked: boolean) => void
  imageCount: number
  confirmationText: string
  confirmText: string
  onConfirmTextChange: (value: string) => void
  isConfirmed: boolean
  deleteLoading: boolean
  onInitiateDelete: () => void
  onCancelDelete: () => void
}

export function PrivacySettingsSection({
  isPublic,
  onToggleVisibility,
  deleteModalOpen,
  onDeleteModalOpenChange,
  deleteRouteUploads,
  onDeleteRouteUploadsChange,
  imageCount,
  confirmationText,
  confirmText,
  onConfirmTextChange,
  isConfirmed,
  deleteLoading,
  onInitiateDelete,
  onCancelDelete,
}: PrivacySettingsSectionProps) {
  return (
    <div className="space-y-8 max-w-xl">
      <div className="space-y-4">
        <p className="text-sm font-medium text-gray-900 dark:text-white">Profile Visibility</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Your profile is currently {isPublic ? 'public' : 'private'}.
        </p>
        <div>
          <Button variant="outline" onClick={onToggleVisibility} className="bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/10 dark:text-red-400 dark:hover:bg-red-900/20">
            {isPublic ? 'Make Private' : 'Make Public'}
          </Button>
        </div>
      </div>

      <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
        <Dialog open={deleteModalOpen} onOpenChange={onDeleteModalOpenChange}>
          <DialogTrigger asChild>
            <button className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300">
              <AlertTriangle className="w-4 h-4" />
              Delete Account
            </button>
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
                      onCheckedChange={(checked) => onDeleteRouteUploadsChange(checked === true)}
                    />
                    <div className="text-sm">
                      <span className="font-medium text-gray-900 dark:text-white">Also delete my uploaded images</span>
                      {imageCount > 0 && (
                        <p className="text-gray-500 dark:text-gray-400 mt-0.5">{imageCount} images will be permanently deleted</p>
                      )}
                      {imageCount === 0 && (
                        <p className="text-gray-500 dark:text-gray-400 mt-0.5">No images to delete</p>
                      )}
                      {!deleteRouteUploads && imageCount > 0 && (
                        <p className="text-gray-500 dark:text-gray-400 mt-0.5">Your images will remain but become anonymous</p>
                      )}
                    </div>
                  </label>
                </div>

                <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-sm font-medium text-red-800 dark:text-red-200 mb-2">
                    To confirm, type: <code className="bg-red-100 dark:bg-red-800 px-2 py-0.5 rounded">{confirmationText}</code>
                  </p>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => onConfirmTextChange(e.target.value)}
                    placeholder={confirmationText}
                    className="w-full px-3 py-2 border border-red-300 dark:border-red-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400"
                  />
                </div>

                <p className="mt-4 font-medium text-red-600 dark:text-red-400">
                  This action cannot be undone. A confirmation email will be sent.
                </p>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
              <Button variant="outline" onClick={onCancelDelete}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={onInitiateDelete}
                disabled={!isConfirmed || deleteLoading}
              >
                {deleteLoading ? 'Sending...' : 'Send Confirmation Email'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
