'use client'

import Image from 'next/image'
import { GripHorizontal, Loader2 } from 'lucide-react'
import { DndContext, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export interface DraftIntakeImage {
  id: string
  imageId: string | null
  previewUrl: string
  label: string
  status: 'attached' | 'uploading' | 'failed'
  progress?: number
}

function SortableDraftThumb({ image }: { image: DraftIntakeImage }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: image.id,
    disabled: image.status !== 'attached',
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800"
      {...attributes}
      {...listeners}
    >
      <Image src={image.previewUrl} alt={image.label} fill unoptimized sizes="80px" className="object-cover" />
      {image.status === 'attached' ? (
        <GripHorizontal className="absolute bottom-1 right-1 z-10 h-3.5 w-3.5 rounded-full bg-black/55 p-[2px] text-white" />
      ) : null}
      <span className="absolute left-1 top-1 z-10 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-black/70 px-1 text-[10px] font-semibold text-white">
        {image.label}
      </span>
      {image.status !== 'attached' ? (
        <div className="absolute inset-x-0 bottom-0 z-10 bg-black/60 px-1.5 py-1 text-[10px] font-medium text-white">
          {image.status === 'failed' ? 'Failed' : `${image.progress || 0}%`}
        </div>
      ) : null}
    </div>
  )
}

interface DraftImageGalleryProps {
  galleryImages: DraftIntakeImage[]
  sortableImageIds: string[]
  onDragEnd: (event: DragEndEvent) => void
}

export function DraftImageGallery({ galleryImages, sortableImageIds, onDragEnd }: DraftImageGalleryProps) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } })
  )

  if (galleryImages.length === 0) return null

  return (
    <div className="overflow-x-auto pb-1">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={sortableImageIds} strategy={horizontalListSortingStrategy}>
          <div className="flex gap-2">
            {galleryImages.map((image) => (
              <SortableDraftThumb key={image.id} image={image} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}

interface DraftUploadStatusProps {
  uploading: boolean
  reordering: boolean
}

export function DraftUploadStatus({ uploading, reordering }: DraftUploadStatusProps) {
  if (!uploading && !reordering) return null

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
      <Loader2 className="h-3 w-3 animate-spin" />
      {reordering ? 'Saving order' : 'Uploading'}
    </span>
  )
}
