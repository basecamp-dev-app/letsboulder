'use client'

import { Facebook, Link2, MessageCircle, Twitter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface ClimbShareDialogProps {
  open: boolean
  climbName: string
  onOpenChange: (open: boolean) => void
  onShareTwitter: () => void
  onShareFacebook: () => void
  onShareWhatsApp: () => void
  onCopyLink: () => void
}

export default function ClimbShareDialog({ open, climbName, onOpenChange, onShareTwitter, onShareFacebook, onShareWhatsApp, onCopyLink }: ClimbShareDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-gray-900 border-gray-800 text-white">
        <DialogHeader>
          <DialogTitle>Share Climb</DialogTitle>
          <DialogDescription className="text-gray-400">
            Share &ldquo;{climbName || 'this climb'}&rdquo; with your friends
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-4 gap-3 py-4">
          <Button variant="outline" onClick={onShareTwitter} className="flex flex-col items-center gap-2 h-auto py-4 border-gray-700 hover:bg-gray-800">
            <Twitter className="w-6 h-6 text-blue-400" />
            <span className="text-xs">Twitter</span>
          </Button>
          <Button variant="outline" onClick={onShareFacebook} className="flex flex-col items-center gap-2 h-auto py-4 border-gray-700 hover:bg-gray-800">
            <Facebook className="w-6 h-6 text-blue-600" />
            <span className="text-xs">Facebook</span>
          </Button>
          <Button variant="outline" onClick={onShareWhatsApp} className="flex flex-col items-center gap-2 h-auto py-4 border-gray-700 hover:bg-gray-800">
            <MessageCircle className="w-6 h-6 text-green-500" />
            <span className="text-xs">WhatsApp</span>
          </Button>
          <Button variant="outline" onClick={onCopyLink} className="flex flex-col items-center gap-2 h-auto py-4 border-gray-700 hover:bg-gray-800">
            <Link2 className="w-6 h-6 text-gray-400" />
            <span className="text-xs">Copy</span>
          </Button>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="w-full">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
