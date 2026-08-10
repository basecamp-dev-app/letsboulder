'use client'

import { useEffect, useState } from 'react'
import { Loader2, UserMinus, UserPlus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { AdminCrag } from '@/features/admin/crags/types'
import {
  listCragMaintainersAction,
  setCragMaintainerAction,
} from '@/features/crags/public'
import type { CragMaintainerItem } from '@/features/crags/public'

interface CragMaintainersDialogProps {
  crag: AdminCrag | null
  onClose: () => void
}

export default function CragMaintainersDialog({ crag, onClose }: CragMaintainersDialogProps) {
  const [maintainers, setMaintainers] = useState<CragMaintainerItem[]>([])
  const [reference, setReference] = useState('')
  const [loading, setLoading] = useState(true)
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!crag) return
    let active = true
    void listCragMaintainersAction({ cragId: crag.id }).then((result) => {
      if (!active) return
      setLoading(false)
      if (!result.success) {
        setError(result.error || 'Failed to load maintainers')
        return
      }
      setMaintainers(result.data || [])
    })
    return () => { active = false }
  }, [crag])

  const assign = async () => {
    if (!crag || !reference.trim()) return
    setUpdatingUserId('new')
    setError(null)
    const result = await setCragMaintainerAction({
      cragId: crag.id,
      userReference: reference,
      isMaintainer: true,
    })
    setUpdatingUserId(null)
    if (!result.success) {
      setError(result.error || 'Failed to assign maintainer')
      return
    }
    setReference('')
    const refreshed = await listCragMaintainersAction({ cragId: crag.id })
    if (refreshed.success) setMaintainers(refreshed.data || [])
  }

  const remove = async (userId: string) => {
    if (!crag) return
    setUpdatingUserId(userId)
    setError(null)
    const result = await setCragMaintainerAction({
      cragId: crag.id,
      userReference: userId,
      isMaintainer: false,
    })
    setUpdatingUserId(null)
    if (!result.success) {
      setError(result.error || 'Failed to remove maintainer')
      return
    }
    setMaintainers((current) => current.filter((item) => item.assignment.user_id !== userId))
  }

  return (
    <Dialog open={Boolean(crag)} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="border-gray-700 bg-gray-900 text-white sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Crag maintainers</DialogTitle>
          <DialogDescription className="text-gray-400">
            Assign review access for {crag?.name}. Use an exact user UUID, @username, or email address.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="sr-only" htmlFor="maintainer-reference">User UUID, username, or email</label>
            <Input
              className="border-gray-700 bg-gray-800"
              disabled={updatingUserId === 'new'}
              id="maintainer-reference"
              onChange={(event) => setReference(event.target.value)}
              placeholder="User UUID, @username, or email"
              value={reference}
            />
            <Button disabled={!reference.trim() || updatingUserId === 'new'} onClick={assign}>
              {updatingUserId === 'new' ? <Loader2 className="animate-spin" /> : <UserPlus />}
              Assign
            </Button>
          </div>

          {error ? <p className="text-sm text-red-400" role="alert">{error}</p> : null}

          <div className="max-h-72 space-y-2 overflow-y-auto" aria-busy={loading}>
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="animate-spin text-gray-400" /></div>
            ) : maintainers.length === 0 ? (
              <p className="rounded-lg border border-dashed border-gray-700 p-5 text-center text-sm text-gray-400">No maintainers assigned.</p>
            ) : maintainers.map((item) => (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-800 bg-gray-950 p-3" key={item.assignment.user_id}>
                <div className="min-w-0">
                  <p className="truncate font-medium">{item.displayName || (item.username ? `@${item.username}` : item.email) || 'User'}</p>
                  <p className="truncate text-xs text-gray-500">{item.assignment.user_id}</p>
                </div>
                <Button
                  aria-label={`Remove ${item.displayName || item.username || item.assignment.user_id} as maintainer`}
                  disabled={updatingUserId === item.assignment.user_id}
                  onClick={() => remove(item.assignment.user_id)}
                  size="icon"
                  variant="destructive"
                >
                  {updatingUserId === item.assignment.user_id ? <Loader2 className="animate-spin" /> : <UserMinus />}
                </Button>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onClose} variant="outline">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
