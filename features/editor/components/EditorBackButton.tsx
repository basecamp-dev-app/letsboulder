'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface EditorBackButtonProps {
  isDirty: boolean
  href?: string
}

export function EditorBackButton({ isDirty, href = '/logbook' }: EditorBackButtonProps) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)

  const handleBack = () => {
    if (isDirty) {
      setDialogOpen(true)
      return
    }

    router.push(href)
  }

  return (
    <>
      <button
        type="button"
        onClick={handleBack}
        className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
      >
        ← Back to logbook
      </button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard unsaved changes?</DialogTitle>
            <DialogDescription>
              Your unsaved route and metadata changes will be lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <button
                type="button"
                className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Keep editing
              </button>
            </DialogClose>
            <button
              type="button"
              onClick={() => router.push(href)}
              className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              Discard changes
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
