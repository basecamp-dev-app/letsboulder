'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { AlertTriangle, ExternalLink, ImageOff, Loader2, MoreVertical } from 'lucide-react'

import { removeCragImageAction } from '@/features/crag-management/actions/remove-crag-image'
import type { ManagedCragImage } from '@/features/crag-management/types/managed-crag-image'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ToastContainer } from '@/components/ui/toast'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

interface ManagedCragImagesProps {
  cragId: string
  countryCode: string | null
  cragSlug: string | null
  initialImages: ManagedCragImage[]
  isAdmin: boolean
}

function statusClass(value: string) {
  if (value === 'approved' || value === 'published' || value === 'public' || value === 'ready') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
  if (value === 'deleted' || value === 'private') return 'border-red-500/30 bg-red-500/10 text-red-200'
  if (value === 'legacy') return 'border-amber-500/30 bg-amber-500/10 text-amber-100'
  return 'border-border bg-muted text-muted-foreground'
}

function formatDate(value: string | null) {
  if (!value) return 'Upload date unavailable'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Upload date unavailable'
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(date)
}

function imagePublicHref(image: ManagedCragImage, countryCode: string | null, cragSlug: string | null) {
  if (!image.imageId || !countryCode || !cragSlug) return null
  if (image.status !== 'approved' || image.visibility !== 'public' || image.processingStatus !== 'ready') return null
  if (image.moderationStatus !== 'approved' && image.moderationStatus !== 'skipped') return null
  return `/${countryCode.toLowerCase()}/${cragSlug}/i/${image.imageId}`
}

function lifecycleStatus(image: ManagedCragImage) {
  if (image.sourceKind === 'legacy') return 'legacy'
  if (image.status === 'deleted') return 'deleted'
  if (image.visibility === 'private') return 'private'
  if (image.processingStatus !== 'ready') return image.processingStatus
  if (image.status === 'approved' && image.visibility === 'public') return 'published'
  return image.status
}

export default function ManagedCragImages({
  cragId,
  countryCode,
  cragSlug,
  initialImages,
  isAdmin,
}: ManagedCragImagesProps) {
  const [images, setImages] = useState(initialImages)
  const [selected, setSelected] = useState<ManagedCragImage | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const { toasts, addToast, removeToast } = useToast()

  function closeDialog() {
    if (pending) return
    setSelected(null)
    setReason('')
    setError(null)
  }

  async function removeImage() {
    if (!selected?.imageId) return
    setPending(true)
    setError(null)
    const result = await removeCragImageAction({ cragId, imageId: selected.imageId, reason })
    setPending(false)
    if (!result.success) {
      setError(result.error || 'Failed to remove image')
      return
    }

    setImages((current) => current.filter((image) => image.imageId !== selected.imageId))
    addToast('Image removed from the public crag', 'success')
    closeDialog()
  }

  if (images.length === 0) {
    return (
      <>
        <ToastContainer toasts={toasts} onRemove={removeToast} />
        <div className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
          <ImageOff className="mx-auto mb-3 h-8 w-8" aria-hidden="true" />
          <p className="font-medium text-foreground">No images on this page</p>
          <p className="mt-1 text-sm">This crag has no managed images in the selected page.</p>
        </div>
      </>
    )
  }

  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {images.map((image) => {
          const identifier = image.imageId || image.cragImageId || 'unknown'
          const publicHref = imagePublicHref(image, countryCode, cragSlug)
          const lifecycle = lifecycleStatus(image)
          const removeLabel = image.sourceKind === 'legacy'
            ? 'Migration required'
            : image.status === 'deleted'
              ? 'Already deleted'
              : isAdmin
                ? 'Remove from crag'
                : 'Administrator required'

          return (
            <article key={`${image.sourceKind}:${identifier}`} className="overflow-hidden rounded-2xl border bg-card shadow-sm">
              <div className="relative aspect-[4/3] bg-muted">
                {image.previewUrl ? (
                  <Image
                    alt={`Crag image ${identifier.slice(0, 8)}`}
                    className="object-cover"
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                    src={image.previewUrl}
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <ImageOff className="h-8 w-8" aria-hidden="true" />
                    <span className="sr-only">Preview unavailable</span>
                  </div>
                )}
                <details className="group absolute right-3 top-3">
                  <summary
                    aria-label={`Image actions for ${identifier.slice(0, 8)}`}
                    aria-haspopup="menu"
                    className="flex size-10 cursor-pointer list-none items-center justify-center rounded-full bg-black/70 text-white shadow-sm transition hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white [&::-webkit-details-marker]:hidden"
                    role="button"
                  >
                    <MoreVertical className="h-5 w-5" aria-hidden="true" />
                  </summary>
                  <div className="absolute right-0 z-10 mt-2 w-52 rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg" role="menu">
                    <button
                      className="w-full rounded-md px-3 py-2 text-left text-sm text-red-300 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:text-muted-foreground"
                      disabled={!image.canRemove}
                      onClick={() => {
                        setSelected(image)
                        setReason('')
                        setError(null)
                      }}
                      role="menuitem"
                      type="button"
                    >
                      {removeLabel}
                    </button>
                  </div>
                </details>
              </div>

              <div className="space-y-4 p-4">
                <div className="flex flex-wrap gap-2">
                  {image.sourceKind === 'legacy' ? (
                    <span className={cn('rounded-full border px-2.5 py-1 text-xs font-medium', statusClass('legacy'))}>Legacy image</span>
                  ) : null}
                  {image.sourceKind !== 'legacy' ? (
                    <span className={cn('rounded-full border px-2.5 py-1 text-xs font-medium capitalize', statusClass(lifecycle))}>
                      {lifecycle}
                    </span>
                  ) : null}
                </div>

                <div>
                  <p className="text-sm font-medium">{image.routeCount} associated {image.routeCount === 1 ? 'route' : 'routes'}</p>
                  {image.routeNames.length > 0 ? (
                    <ul className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                      {image.routeNames.map((name, index) => <li key={`${name}:${index}`}>{name}</li>)}
                    </ul>
                  ) : (
                    <p className="mt-1 text-sm text-muted-foreground">No associated route names</p>
                  )}
                  {image.routesWithoutAlternativeImage > 0 ? (
                    <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-300">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {image.routesWithoutAlternativeImage} {image.routesWithoutAlternativeImage === 1 ? 'route has' : 'routes have'} no other active image
                    </p>
                  ) : null}
                </div>

                <div className="flex items-end justify-between gap-3 border-t pt-3 text-xs text-muted-foreground">
                  <div>
                    <p>{formatDate(image.createdAt)}</p>
                    <p className="mt-1 font-mono" title={identifier}>{identifier.slice(0, 8)}</p>
                  </div>
                  {publicHref ? (
                    <Link className="inline-flex items-center gap-1 text-sm font-medium text-blue-300 hover:text-blue-200" href={publicHref}>
                      View public image <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  ) : (
                    <span className="text-right">Public image unavailable</span>
                  )}
                </div>
              </div>
            </article>
          )
        })}
      </div>

      <Dialog open={selected !== null} onOpenChange={(open) => { if (!open) closeDialog() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove image from crag?</DialogTitle>
            <DialogDescription>
              The image will disappear publicly. Routes and edit history will be preserved. Routes without another active image may lose their topo.
            </DialogDescription>
          </DialogHeader>
          {selected?.previewUrl ? (
            <div className="relative aspect-[16/9] overflow-hidden rounded-xl bg-muted">
              <Image alt="Selected image preview" className="object-cover" fill sizes="480px" src={selected.previewUrl} unoptimized />
            </div>
          ) : null}
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="image-removal-reason">Deletion reason</label>
            <textarea
              aria-describedby={error ? 'image-removal-error' : undefined}
              className="min-h-28 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              disabled={pending}
              id="image-removal-reason"
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Explain why this image should no longer appear on the crag"
              required
              value={reason}
            />
            <p className="text-right text-xs text-muted-foreground">{reason.trim().length}/500</p>
            {error ? <p className="text-sm text-red-300" id="image-removal-error" role="alert">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button disabled={pending} onClick={closeDialog} type="button" variant="outline">Cancel</Button>
            <Button disabled={pending || reason.trim().length === 0} onClick={() => { void removeImage() }} type="button" variant="destructive">
              {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              {pending ? 'Removing…' : 'Remove image'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
